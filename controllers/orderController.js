import Order from "../models/Order.js";
import Wallet from "../models/Wallet.js";
import User from "../models/User.js";
import Settings from "../models/Settings.js";
import Service from "../models/Service.js";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";

/* ================= HELPER ================= */
const calculateBalance = (transactions = []) =>
  transactions.reduce((acc, t) => acc + (t.amount || 0), 0);

/* =========================================================
CREATE ORDER (ALIGNED WITH SERVICE PRICING)
========================================================= */
export const createOrder = async (req, res) => {
  try {
    const { category, service, link, quantity } = req.body;

    if (!category || !service || !link || !quantity) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const qty = Number(quantity);
    if (qty <= 0) {
      return res.status(400).json({ message: "Invalid quantity" });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found" });

    /* ================= WALLET ================= */

    let wallet = await Wallet.findOne({ user: user._id });

    if (!wallet) {
      wallet = await Wallet.create({
        user: user._id,
        balance: 0,
        transactions: [],
      });
    }

    /* ================= SERVICE ================= */

    const serviceData = await Service.findOne({
      name: service,
      status: true,
    });

    if (!serviceData)
      return res.status(404).json({ message: "Service not found" });

    if (qty < serviceData.min || qty > serviceData.max) {
      return res.status(400).json({
        message: `Quantity must be between ${serviceData.min} and ${serviceData.max}`,
      });
    }

    /* ================= PRICE CALCULATION ================= */

    const systemRate = Number(serviceData.rate || 0);

    let finalRate = systemRate;
    let resellerCommission = 0;

    if (user.resellerOwner) {
      const reseller = await User.findById(user.resellerOwner);

      const resellerCommissionRate =
        Number(reseller?.resellerCommissionRate || 0);

      finalRate = systemRate + (systemRate * resellerCommissionRate) / 100;

      resellerCommission =
        ((qty / 1000) * systemRate * resellerCommissionRate) / 100;
    }

    const finalCharge = (qty / 1000) * finalRate;
    const baseCharge = (qty / 1000) * systemRate;

    /* ================= BALANCE CHECK ================= */

    const currentBalance =
      typeof wallet.balance === "number"
        ? wallet.balance
        : calculateBalance(wallet.transactions);

    if (currentBalance < finalCharge) {
      return res.status(400).json({ message: "Insufficient balance" });
    }

    /* ================= CREATE ORDER ================= */

    const order = await Order.create({
      orderId: "ORD-" + uuidv4().slice(0, 8),
      userId: user._id,
      resellerOwner: user.resellerOwner || null,
      resellerCommission,
      category,
      service,
      link,
      quantity: qty,
      charge: finalCharge,
      status: "pending",

      provider: serviceData.provider,
      providerApiUrl: serviceData.providerApiUrl,
      providerServiceId: serviceData.providerServiceId,
    });

    /* ================= SEND TO PROVIDER ================= */

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
      order.errorMessage =
        providerError.response?.data || providerError.message;

      await order.save();

      return res.status(500).json({
        message: "Order failed to reach provider",
      });
    }

    /* ================= WALLET DEDUCTION ================= */

    const transaction = {
      type: "Order",
      amount: -Number(finalCharge),
      status: "Completed",
      note: `Order #${order.orderId}`,
      date: new Date(),
    };

    wallet.transactions.push(transaction);
    wallet.balance = calculateBalance(wallet.transactions);

    await wallet.save();

    await User.findByIdAndUpdate(user._id, {
      balance: wallet.balance,
    });

    /* ================= ADMIN REVENUE ================= */

    const settings = await Settings.findOne();

    if (settings) {
      const adminRevenue = finalCharge - baseCharge;
      settings.totalRevenue += adminRevenue;
      await settings.save();
    }

    /* ================= RESELLER EARNINGS ================= */

    if (user.resellerOwner && resellerCommission > 0) {
      const reseller = await User.findById(user.resellerOwner);

      reseller.resellerWallet =
        (reseller.resellerWallet || 0) + resellerCommission;

      await reseller.save();
    }

    res.status(201).json({
      order,
      balance: wallet.balance,
    });

  } catch (error) {
    console.error("CREATE ORDER ERROR:", error);

    res.status(500).json({
      message: "Order failed",
    });
  }
};

/* =========================================================
GET MY ORDERS
========================================================= */
export const getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({
      userId: req.user._id,
    })
      .sort({ createdAt: -1 })
      .lean();

    res.json(orders);

  } catch (error) {
    console.error("GET ORDERS ERROR:", error);

    res.status(500).json({
      message: "Failed to fetch orders",
    });
  }
};

/* =========================================================
PREVIEW ORDER (MATCHES CREATE ORDER LOGIC)
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

    const systemRate = Number(serviceData.rate || 0);

    let finalRate = systemRate;

    const user = await User.findById(req.user._id);

    if (user?.resellerOwner) {
      const reseller = await User.findById(user.resellerOwner);

      const resellerCommissionRate =
        Number(reseller?.resellerCommissionRate || 0);

      finalRate = systemRate + (systemRate * resellerCommissionRate) / 100;
    }

    const baseCharge = (qty / 1000) * systemRate;
    const finalCharge = (qty / 1000) * finalRate;

    res.json({
      service,
      quantity: qty,
      baseCharge: baseCharge.toFixed(4),
      finalCharge: finalCharge.toFixed(4),
      systemRate,
      finalRate,
    });

  } catch (error) {
    console.error("PREVIEW ORDER ERROR:", error);

    res.status(500).json({
      message: "Failed to calculate charge",
    });
  }
};
