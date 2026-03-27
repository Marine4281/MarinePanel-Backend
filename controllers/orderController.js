// controllers/orderController.js

import Order from "../models/Order.js";
import Wallet from "../models/Wallet.js";
import User from "../models/User.js";
import Settings from "../models/Settings.js";
import Service from "../models/Service.js";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";

// ================= HELPER =================
const calculateBalance = (transactions = []) =>
  transactions.reduce((acc, t) => acc + (t.amount || 0), 0);

/* =========================================================
CREDIT RESELLER (SAFE - CALLED ON COMPLETION)
========================================================= */
export const creditResellerCommission = async (order) => {
  try {
    if (
      order.status !== "completed" ||
      order.earningsCredited ||
      !order.resellerOwner ||
      order.resellerCommission <= 0
    ) {
      return;
    }

    const wallet = await Wallet.findOne({ user: order.resellerOwner });
    if (!wallet) return;

    wallet.transactions.push({
      type: "Commission",
      amount: Number(order.resellerCommission),
      status: "Completed",
      note: `Commission from ${order.orderId}`,
      reference: order._id,
      createdAt: new Date(),
});

    wallet.balance = 
    calculateBalance(wallet.transactions);
    });

    order.earningsCredited = true;

    await Promise.all([wallet.save(), order.save()]);

  } catch (error) {
    console.error("Commission error:", error);
  }
};

/* =========================================================
REVERSE RESELLER COMMISSION (ON REFUND)
========================================================= */
export const reverseResellerCommission = async (order) => {
  try {
    if (
      !order.earningsCredited ||      // nothing credited yet
      !order.resellerOwner ||         // no reseller
      order.resellerCommission <= 0   // zero commission
    ) {
      return;
    }

    const wallet = await Wallet.findOne({ user: order.resellerOwner });
    if (!wallet) return;

    wallet.balance -= order.resellerCommission;
wallet.transactions.push({
  type: "Commission Reversal",
  amount: -Number(order.resellerCommission),
  status: "Completed",
  note: `Reversal for ${order.orderId}`,
  reference: order._id,
  createdAt: new Date(),
});

wallet.balance = 
calculateBalance(wallet.transactions);
    });

    order.earningsCredited = false; // 🔥 prevents double reversal
    await Promise.all([wallet.save(), order.save()]);

  } catch (err) {
    console.error("Commission Reversal Error:", err);
  }
};
/* =========================================================
CREATE ORDER
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

    if (!serviceData) {
      return res.status(404).json({ message: "Service not found" });
    }

    if (serviceData.visible === false) {
      return res.status(403).json({ message: "Service not available" });
    }

    /* ================= INIT ================= */

    let isFreeOrder = false;
    let finalCharge = 0;
    let baseCharge = 0;
    let resellerCommission = 0;

    /* ================= FREE ================= */

    if (serviceData.isFree) {
      isFreeOrder = true;

      const maxPerClaim = Number(serviceData.freeQuantity || 0);
      const cooldown = Number(serviceData.cooldownHours || 0);

      if (!maxPerClaim) {
        return res.status(400).json({ message: "Free service not configured" });
      }

      if (qty > maxPerClaim) {
        return res.status(400).json({
          message: `Max free quantity is ${maxPerClaim}`,
        });
      }

      if (cooldown > 0) {
        const lastOrder = await Order.findOne({
          userId: user._id,
          service,
          isFreeOrder: true,
        }).sort({ createdAt: -1 });

        if (lastOrder) {
          const hoursPassed =
            (Date.now() - new Date(lastOrder.createdAt)) / 3600000;

          if (hoursPassed < cooldown) {
            return res.status(400).json({
              message: `Try again in ${Math.ceil(cooldown - hoursPassed)}h`,
            });
          }
        }
      }

      finalCharge = 0;
    }

    /* ================= PAID ================= */

    if (!isFreeOrder) {
      if (qty < serviceData.min || qty > serviceData.max) {
        return res.status(400).json({
          message: `Quantity must be ${serviceData.min}-${serviceData.max}`,
        });
      }

      const providerRate = Number(serviceData.rate || 0);

      const settings = await Settings.findOne().lean();
      const adminRate = Number(settings?.commission || 0);

      const systemRate = providerRate + (providerRate * adminRate) / 100;

      let finalRate = systemRate;

      if (user.resellerOwner) {
        const reseller = await User.findById(user.resellerOwner);

        const resellerRate = Number(reseller?.resellerCommissionRate || 0);

        finalRate = systemRate + (systemRate * resellerRate) / 100;

        resellerCommission =
          ((qty / 1000) * systemRate * resellerRate) / 100;
      }

      finalCharge = (qty / 1000) * finalRate;
      baseCharge = (qty / 1000) * providerRate;

      if (wallet.balance < finalCharge) {
        return res.status(400).json({ message: "Insufficient balance" });
      }
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
      isFreeOrder,
      earningsCredited: false,

      provider: serviceData.provider,
      providerApiUrl: serviceData.providerApiUrl,
      providerServiceId: serviceData.providerServiceId,
    });

    /* ================= PROVIDER ================= */

    try {
      const response = await axios.post(
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

      if (response?.data?.order) {
        order.providerOrderId = response.data.order;
        order.providerStatus = "processing";
      }

      order.providerResponse = response.data;
      await order.save();

    } catch (err) {
      order.status = "failed";
      order.providerStatus = "failed";
      order.errorMessage = err.response?.data || err.message;

      await order.save();

      return res.status(500).json({
        message: "Provider failed",
      });
    }

    /* ================= WALLET DEDUCTION ================= */

    if (!isFreeOrder) {
  wallet.transactions.push({
    type: "Order",
    amount: -Number(finalCharge),
    status: "Completed",
    note: `Order ${order._id}`, // ✅ better than _id
    reference: order._id,
    createdAt: new Date(),
  });

  // ✅ ALWAYS derive balance from transactions
  wallet.balance = calculateBalance(wallet.transactions);

  await wallet.save();
    }

    /* ================= ADMIN REVENUE ================= */

    if (!isFreeOrder) {
      const settings = await Settings.findOne();
      if (settings) {
        settings.totalRevenue += finalCharge - baseCharge;
        await settings.save();
      }
    }

    res.status(201).json({
      order,
      balance: wallet.balance,
    });

  } catch (error) {
    console.error("CREATE ORDER ERROR:", error);
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
      return res.status(400).json({ message: "Missing fields" });
    }

    const qty = Number(quantity);

    const serviceData = await Service.findOne({
      name: service,
      status: true,
    });

    if (!serviceData) {
      return res.status(404).json({ message: "Service not found" });
    }

    if (serviceData.isFree) {
      return res.json({
        finalCharge: 0,
        baseCharge: 0,
        isFree: true,
      });
    }

    const providerRate = Number(serviceData.rate || 0);
    const settings = await Settings.findOne().lean();

    const systemRate =
      providerRate + (providerRate * settings.commission) / 100;

    let finalRate = systemRate;

    const user = await User.findById(req.user._id);

    if (user?.resellerOwner) {
      const reseller = await User.findById(user.resellerOwner);

      const rRate = Number(reseller?.resellerCommissionRate || 0);

      finalRate = systemRate + (systemRate * rRate) / 100;
    }

    const baseCharge = (qty / 1000) * providerRate;
    const finalCharge = (qty / 1000) * finalRate;

    res.json({
      baseCharge,
      finalCharge,
      systemRate,
      finalRate,
      isFree: false,
    });

  } catch (error) {
    res.status(500).json({ message: "Preview failed" });
  }
};
