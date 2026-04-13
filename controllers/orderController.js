// controllers/orderController.js

import Order from "../models/Order.js";
import Wallet from "../models/Wallet.js";
import User from "../models/User.js";
import Settings from "../models/Settings.js";
import Service from "../models/Service.js";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import ProviderProfile from "../models/ProviderProfile.js";
import { getNextOrderId } from "../utils/orderId.js";
import { callProvider } from "../utils/providerApi.js";

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
      note: `Commission - #${order.customOrderId}`,
      reference: order._id,
      createdAt: new Date(),
    });

    wallet.balance = calculateBalance(wallet.transactions);

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

    wallet.transactions.push({
      type: "Commission Reversal",
      amount: -Number(order.resellerCommission),
      status: "Completed",
      note: `Reversal - #${order.customOrderId}`,
      reference: order._id,
      createdAt: new Date(),
    });

    wallet.balance = calculateBalance(wallet.transactions);

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

    if (user.isBlocked) {
      return res.status(403).json({ message: "Account is blocked" });
    }

    if (user.isFrozen) {
      return res.status(403).json({ message: "Account is frozen" });
    }

    let wallet = await Wallet.findOne({ user: user._id });
    if (!wallet) {
      wallet = await Wallet.create({
        user: user._id,
        balance: 0,
        transactions: [],
      });
    }

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

    /* ================= 🔥 VALIDATE PROVIDER FIRST ================= */

    const providerProfile = await ProviderProfile.findById(
      serviceData.providerProfileId
    );

    if (!providerProfile) {
      return res.status(400).json({
        message: "Provider profile not found",
      });
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

      const currentBalance = calculateBalance(wallet.transactions);

      if (currentBalance < finalCharge) {
        return res.status(400).json({ message: "Insufficient balance" });
      }
    }

    /* ================= ORDER ID ================= */

    const customOrderId = await getNextOrderId();

    /* ================= 🔥 WALLET DEDUCT FIRST ================= */

    if (!isFreeOrder) {
      wallet.transactions.push({
        type: "Order",
        amount: -Number(finalCharge),
        status: "Completed",
        note: `Order #${customOrderId}`,
        createdAt: new Date(),
      });

      wallet.balance = calculateBalance(wallet.transactions);
      await wallet.save();

      await User.findByIdAndUpdate(user._id, {
        balance: wallet.balance,
      });
    }

    /* ================= CREATE ORDER ================= */

    const order = await Order.create({
      orderId: "ORD-" + uuidv4().slice(0, 8),
      customOrderId,
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
      isCharged: !isFreeOrder, // 🔥 KEY FIX

      provider: serviceData.provider,
      providerApiUrl: serviceData.providerApiUrl,
      providerServiceId: serviceData.providerServiceId,
    });

    /* ================= PROVIDER CALL ================= */

    try {
      const response = await axios.post(
        providerProfile.apiUrl,
        {
          key: providerProfile.apiKey,
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
        order.status = "processing";
      }

      order.providerResponse = response.data;
      await order.save();

    } catch (err) {
      /* ================= 🔥 SAFE REFUND ================= */

      if (!isFreeOrder) {
        wallet.transactions.push({
          type: "Refund",
          amount: Number(finalCharge),
          status: "Completed",
          note: `Refund - Provider failed #${customOrderId}`,
          reference: order._id,
          createdAt: new Date(),
        });

        wallet.balance = calculateBalance(wallet.transactions);
        await wallet.save();
      }

      order.status = "failed";
      order.providerStatus = "failed";
      order.errorMessage = err.response?.data || err.message;

      await order.save();

      return res.status(500).json({
        message: "Provider failed",
        error: err.response?.data || err.message,
      });
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
    const {
      search = "",
      status,
      fromDate,
      toDate,
      page = 1,
      limit = 10,
    } = req.query;

    const query = {
      userId: req.user._id, // 🔒 ONLY USER'S ORDERS
    };

    /* 🔍 SEARCH (SAFE) */
    if (search && search.trim() !== "") {
      const cleanSearch = search.replace("#", "").trim();

      const orConditions = [
        { service: { $regex: cleanSearch, $options: "i" } },
        { link: { $regex: cleanSearch, $options: "i" } },
      ];

      // 👉 ONLY match ID as number (no regex!)
      if (!isNaN(cleanSearch)) {
        orConditions.push({ customOrderId: Number(cleanSearch) });
      }

      query.$or = orConditions;
    }

    /* 📌 STATUS */
    if (status) {
      query.status = status;
    }

    /* 📅 DATE */
    if (fromDate || toDate) {
      query.createdAt = {};

      if (fromDate) {
        query.createdAt.$gte = new Date(fromDate);
      }

      if (toDate) {
        const end = new Date(toDate);
        end.setHours(23, 59, 59, 999);
        query.createdAt.$lte = end;
      }
    }

    /* 📄 PAGINATION */
    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.max(1, Number(limit));
    const skip = (pageNum - 1) * limitNum;

    const [orders, total] = await Promise.all([
      Order.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),

      Order.countDocuments(query),
    ]);

    res.json({
      orders,
      totalPages: Math.ceil(total / limitNum),
    });

  } catch (error) {
    console.error("GET MY ORDERS ERROR:", error);
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

//Stats
export const getMyOrdersStats = async (req, res) => {
  try {
    const { search, status, fromDate, toDate } = req.query;

    const match = {
      userId: req.user._id, // 🔒 ONLY USER DATA
    };

    /* STATUS */
    if (status) match.status = status;

    /* DATE */
    if (fromDate || toDate) {
      match.createdAt = {};
      if (fromDate) match.createdAt.$gte = new Date(fromDate);
      if (toDate) match.createdAt.$lte = new Date(toDate);
    }

    /* SEARCH */
    if (search) {
      const regex = new RegExp(search, "i");

      match.$or = [
        { customOrderId: regex },
        { service: regex },
        { link: regex },
      ];
    }

    const stats = await Order.aggregate([
      { $match: match },

      {
        $facet: {
          total: [{ $count: "count" }],
          pending: [{ $match: { status: "pending" } }, { $count: "count" }],
          processing: [{ $match: { status: "processing" } }, { $count: "count" }],
          completed: [{ $match: { status: "completed" } }, { $count: "count" }],
          partial: [{ $match: { status: "partial" } }, { $count: "count" }],
          failed: [{ $match: { status: "failed" } }, { $count: "count" }],
        },
      },
    ]);

    const result = stats[0];

    res.json({
      total: result.total[0]?.count || 0,
      pending: result.pending[0]?.count || 0,
      processing: result.processing[0]?.count || 0,
      completed: result.completed[0]?.count || 0,
      partial: result.partial[0]?.count || 0,
      failed: result.failed[0]?.count || 0,
    });

  } catch (err) {
    console.error("USER STATS ERROR:", err);
    res.status(500).json({ message: "Failed to fetch stats" });
  }
};

export const cancelOrder = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // 🔒 Only owner can cancel
    if (order.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    // 🚫 Prevent duplicate cancel
    if (order.cancelRequested) {
      return res.status(400).json({
        message: "Cancel already requested",
      });
    }

    // 🚫 Cannot cancel completed orders
    if (order.status === "completed") {
      return res.status(400).json({
        message: "Cannot cancel completed order",
      });
    }

    // 🔍 Check service allows cancel
    const service = await Service.findOne({
      providerServiceId: order.providerServiceId,
    });

    if (!service?.cancelAllowed) {
      return res.status(400).json({
        message: "Cancel not supported for this service",
      });
    }

    // 🔍 Get provider
    const provider = await ProviderProfile.findById(order.providerProfileId);

    if (!provider) {
      return res.status(400).json({
        message: "Provider not found",
      });
    }

    // 🚀 CALL PROVIDER CANCEL API
    const response = await callProvider(provider, {
      action: "cancel",
      orders: order.providerOrderId.toString(),
    });

    // 💾 STORE REQUEST ONLY (NO MONEY LOGIC)
    order.cancelRequested = true;
    order.cancelRequestedAt = new Date();
    order.cancelStatus = "pending";
    order.cancelResponse = response;

    await order.save();

    res.json({
      message: "Cancel request sent",
      response,
    });

  } catch (error) {
    console.error("❌ Cancel Order Error:", error);

    res.status(500).json({
      message: "Cancel request failed",
      error: error.message,
    });
  }
};
