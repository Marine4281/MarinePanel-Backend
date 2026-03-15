import Order from "../models/Order.js";
import Wallet from "../models/Wallet.js";
import User from "../models/User.js";
import Settings from "../models/Settings.js";
import Service from "../models/Service.js";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import mongoose from "mongoose";

// ================= HELPER =================
const calculateBalance = (transactions = []) =>
  transactions.reduce((acc, t) => acc + (t.amount || 0), 0);

/* =========================================================
CREATE ORDER (Enterprise + Cooldown Free Support)
========================================================= */
export const createOrder = async (req, res) => {
  try {
    const { category, service, link, quantity } = req.body;

    if (!category || !service || !link || !quantity) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const qty = Number(quantity);
    if (qty <= 0) return res.status(400).json({ message: "Invalid quantity" });

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found" });

    let wallet = await Wallet.findOne({ user: req.user._id });
    if (!wallet) {
      wallet = await Wallet.create({
        user: req.user._id,
        balance: 0,
        transactions: [],
      });
    }

    const serviceData = await Service.findOne({ name: service, status: true });
    if (!serviceData) return res.status(404).json({ message: "Service not found" });

    let finalCharge = 0;
    let baseCharge = 0;
    let resellerCommission = 0;
    let isFreeOrder = false;

    /* ======================================================
       🔥 FREE SERVICE LOGIC
    ===================================================== */
    if (serviceData.isFree) {
      isFreeOrder = true;

      const maxPerClaim = serviceData.freeQuantity || 0;
      const cooldown = serviceData.cooldownHours || 0;

      if (qty > maxPerClaim)
        return res.status(400).json({
          message: `Max free quantity per claim is ${maxPerClaim}`,
        });

      if (cooldown > 0) {
        const lastOrder = await Order.findOne({
          userId: req.user._id,
          service,
          isFreeOrder: true,
        }).sort({ createdAt: -1 });

        if (lastOrder) {
          const hoursPassed =
            (Date.now() - new Date(lastOrder.createdAt)) / (1000 * 60 * 60);
          if (hoursPassed < cooldown) {
            const remaining = Math.ceil(cooldown - hoursPassed);
            return res.status(400).json({
              message: `You can claim again in ${remaining} hour(s).`,
            });
          }
        }
      }

      finalCharge = 0;
    }

    /* ======================================================
       💰 PAID SERVICE LOGIC
    ===================================================== */
    else {
      if (qty < serviceData.min || qty > serviceData.max)
        return res.status(400).json({
          message: `Quantity must be between ${serviceData.min} and ${serviceData.max}`,
        });

      let settings = await Settings.findOne();
      if (!settings) {
        settings = await Settings.create({
          commission: 50,
          totalRevenue: 0,
          defaultResellerCommission: 50,
        });
      }

      const commissionPercent = settings.commission;

      baseCharge = (qty / 1000) * serviceData.rate;
      finalCharge = baseCharge * (1 + commissionPercent / 100);

      const currentBalance =
        typeof wallet.balance === "number"
          ? wallet.balance
          : calculateBalance(wallet.transactions);

      // -------------------- RESELLER COMMISSION --------------------
      if (user.resellerOwner) {
        const reseller = await User.findById(user.resellerOwner);
        const resellerRate =
          reseller?.commissionRate || settings.defaultResellerCommission || 50; // default 50%
        resellerCommission = baseCharge * (resellerRate / 100);

        // Add commission to resellerWallet
        reseller.resellerWallet = (reseller.resellerWallet || 0) + resellerCommission;
        await reseller.save();
      }

      if (currentBalance < finalCharge) {
        return res.status(400).json({ message: "Insufficient balance" });
      }
    }

    /* ======================================================
       📦 CREATE ORDER
    ===================================================== */
    const order = await Order.create({
      orderId: "ORD-" + uuidv4().slice(0, 8),
      userId: req.user._id,
      resellerOwner: user.resellerOwner || null, // Save reseller owner
      resellerCommission,
      category,
      service,
      link,
      quantity: qty,
      charge: finalCharge,
      status: "pending",
      isFreeOrder,
      provider: serviceData.provider,
      providerApiUrl: serviceData.providerApiUrl,
      providerServiceId: serviceData.providerServiceId,
    });

    /* ======================================================
       🚀 SEND TO PROVIDER
    ===================================================== */
    try {
      const providerResponse = await axios.post(
        serviceData.providerApiUrl,
        {
          key: serviceData.providerApiKey,
          action: "add",
          service: serviceData.providerServiceId,
          link,
          quantity: qty,
        },
        { timeout: 15000 }
      );

      if (providerResponse?.data?.order) {
        order.providerOrderId = providerResponse.data.order;
        order.providerStatus = "processing";
      }

      order.providerResponse = providerResponse.data;
      await order.save();
    } catch (providerError) {
      order.status = "failed";
      order.providerStatus = "failed";
      order.errorMessage = providerError.response?.data || providerError.message;
      await order.save();

      return res.status(500).json({ message: "Order failed to reach provider" });
    }

    /* ======================================================
       💳 WALLET DEDUCTION (ONLY IF PAID)
    ===================================================== */
    if (!isFreeOrder) {
      const transaction = {
        type: "Order",
        amount: -Number(finalCharge),
        status: "Completed",
        note: `Order #${order._id}`,
        date: new Date(),
      };

      wallet.transactions.push(transaction);
      wallet.balance = calculateBalance(wallet.transactions);
      await wallet.save();

      await User.findByIdAndUpdate(req.user._id, {
        balance: wallet.balance,
      });

      const settings = await Settings.findOne();
      const commissionAmount = finalCharge - baseCharge;
      settings.totalRevenue += commissionAmount;
      await settings.save();
    }

    res.status(201).json({ order, balance: wallet.balance });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Order failed" });
  }
};


/* =========================================================
   GET MY ORDERS
========================================================= */
export const getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .lean();

    res.json(orders);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to fetch orders" });
  }
};
/* =========================================================
   PREVIEW ORDER
========================================================= */
export const previewOrder = async (req, res) => {
  try {
    const { service, quantity } = req.body;

    if (!service || !quantity) {
      return res.status(400).json({
        message: "Service and quantity are required",
      });
    }

    const qty = Number(quantity);

    const serviceData = await Service.findOne({
      name: service,
      status: true,
    });

    if (!serviceData)
      return res.status(404).json({ message: "Service not found" });

    if (serviceData.isFree) {
      return res.json({
        service,
        quantity: qty,
        baseCharge: 0,
        commissionPercent: 0,
        finalCharge: 0,
        isFree: true,
      });
    }

    let settings = await Settings.findOne();
    if (!settings) {
      settings = await Settings.create({
        commission: 50,
        totalRevenue: 0,
      });
    }

    const commissionPercent = settings.commission;

    const baseCharge = (qty / 1000) * serviceData.rate;
    const finalCharge = baseCharge * (1 + commissionPercent / 100);

    res.json({
      service,
      quantity: qty,
      baseCharge: baseCharge.toFixed(4),
      commissionPercent,
      finalCharge: finalCharge.toFixed(4),
      isFree: false,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to calculate charge" });
  }
};
