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
CREDIT RESELLER COMMISSION (SAFE - CALLED ON COMPLETION)
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
      !order.earningsCredited ||
      !order.resellerOwner ||
      order.resellerCommission <= 0
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
    order.earningsCredited = false;

    await Promise.all([wallet.save(), order.save()]);
  } catch (err) {
    console.error("Commission Reversal Error:", err);
  }
};

/* =========================================================
CREDIT CHILD PANEL COMMISSION (SAFE - CALLED ON COMPLETION)
Mirrors creditResellerCommission but for child panel owners.
Child panel owner earns based on childPanelCommissionRate set
by main admin on their account.
========================================================= */
export const creditChildPanelCommission = async (order) => {
  try {
    if (
      order.status !== "completed" ||
      order.childPanelEarningsCredited ||
      !order.childPanelOwner ||
      order.childPanelCommission <= 0
    ) {
      return;
    }

    const wallet = await Wallet.findOne({ user: order.childPanelOwner });
    if (!wallet) return;

    wallet.transactions.push({
      type: "CP Commission",
      amount: Number(order.childPanelCommission),
      status: "Completed",
      note: `CP Commission - #${order.customOrderId}`,
      reference: order._id,
      createdAt: new Date(),
    });

    wallet.balance = calculateBalance(wallet.transactions);
    order.childPanelEarningsCredited = true;

    await Promise.all([wallet.save(), order.save()]);
  } catch (error) {
    console.error("Child panel commission error:", error);
  }
};

/* =========================================================
REVERSE CHILD PANEL COMMISSION (ON REFUND)
========================================================= */
export const reverseChildPanelCommission = async (order) => {
  try {
    if (
      !order.childPanelEarningsCredited ||
      !order.childPanelOwner ||
      order.childPanelCommission <= 0
    ) {
      return;
    }

    const wallet = await Wallet.findOne({ user: order.childPanelOwner });
    if (!wallet) return;

    wallet.transactions.push({
      type: "CP Commission Reversal",
      amount: -Number(order.childPanelCommission),
      status: "Completed",
      note: `CP Reversal - #${order.customOrderId}`,
      reference: order._id,
      createdAt: new Date(),
    });

    wallet.balance = calculateBalance(wallet.transactions);
    order.childPanelEarningsCredited = false;

    await Promise.all([wallet.save(), order.save()]);
  } catch (err) {
    console.error("Child panel commission reversal error:", err);
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

    /* ================= VALIDATE PROVIDER ================= */

    const providerProfile = await ProviderProfile.findById(
      serviceData.providerProfileId
    );

    if (!providerProfile) {
      return res.status(400).json({ message: "Provider profile not found" });
    }

    /* ================= RESOLVE CHILD PANEL OWNER =================
    If this user belongs to a child panel (via scope), we resolve
    the child panel owner so we can stamp it on the order and later
    credit their commission when the order completes.
    ================================================================ */
    let childPanelOwnerId = null;
    let childPanelCommission = 0;
    let childPanelPerOrderFee = 0;

    if (user.childPanelOwner) {
      const cpOwner = await User.findById(user.childPanelOwner);
      if (cpOwner && cpOwner.isChildPanel && cpOwner.childPanelIsActive) {
        childPanelOwnerId = cpOwner._id;

        // Per-order fee charged by main admin to child panel owner
        // This is deducted from child panel owner's wallet on completion
        childPanelPerOrderFee = Number(cpOwner.childPanelPerOrderFee || 0);

        // Commission rate the child panel owner earns on each order
        // Set by main admin on the child panel owner's account
        const cpCommissionRate = Number(cpOwner.childPanelCommissionRate || 0);
        if (cpCommissionRate > 0) {
          // Will be calculated properly after finalCharge is known (below)
        }
      }
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

      let finalRate;

      // ── CP-OWNED SERVICE (cpOwner !== null) ──
      // Rate stored is the raw provider rate. The CP owner sets their own
      // commission on top. Admin commission does NOT apply here — the CP
      // owner pays the provider directly, not through the main panel.
      if (serviceData.cpOwner) {
        const cpOwner = childPanelOwnerId
          ? await User.findById(childPanelOwnerId)
          : null;
        const cpCommissionRate = Number(cpOwner?.childPanelCommissionRate || 0);
        finalRate = providerRate + (providerRate * cpCommissionRate) / 100;

        // CP owner earns the commission markup
        if (cpOwner && cpCommissionRate > 0) {
          childPanelCommission = (qty / 1000) * (finalRate - providerRate);
        }
      } else {
        // ── MAIN PLATFORM SERVICE ──
        // Apply admin commission on top of provider rate
        const adminRate = Number(settings?.commission || 0);
        const systemRate = providerRate + (providerRate * adminRate) / 100;

        finalRate = systemRate;

        if (user.resellerOwner) {
          const reseller = await User.findById(user.resellerOwner);
          const resellerRate = Number(reseller?.resellerCommissionRate || 0);
          finalRate = systemRate + (systemRate * resellerRate) / 100;
          resellerCommission = ((qty / 1000) * systemRate * resellerRate) / 100;
        }

        // CP owner commission on platform service orders (based on finalCharge)
        if (childPanelOwnerId && !serviceData.cpOwner) {
          const cpOwner = await User.findById(childPanelOwnerId);
          const cpCommissionRate = Number(cpOwner?.childPanelCommissionRate || 0);
          if (cpCommissionRate > 0) {
            // Commission calculated after finalCharge is set below
            childPanelCommission = 0; // will set after finalCharge
          }
        }
      }

      finalCharge = (qty / 1000) * finalRate;
      baseCharge = (qty / 1000) * providerRate;

      // For platform services with CP owner, finalize CP commission now
      if (childPanelOwnerId && !serviceData.cpOwner) {
        const cpOwner = await User.findById(childPanelOwnerId);
        const cpCommissionRate = Number(cpOwner?.childPanelCommissionRate || 0);
        if (cpCommissionRate > 0) {
          childPanelCommission = (finalCharge * cpCommissionRate) / 100;
        }
      }

      const currentBalance = calculateBalance(wallet.transactions);

      if (currentBalance < finalCharge) {
        return res.status(400).json({ message: "Insufficient balance" });
      }
    }

    /* ================= ORDER ID ================= */

    const customOrderId = await getNextOrderId();

    /* ================= WALLET DEDUCT FIRST ================= */

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

      await User.findByIdAndUpdate(user._id, { balance: wallet.balance });
    }

    /* ================= CREATE ORDER ================= */

    const order = await Order.create({
      orderId: "ORD-" + uuidv4().slice(0, 8),
      customOrderId,
      userId: user._id,

      // Reseller
      resellerOwner: user.resellerOwner || null,
      resellerCommission,

      // Child panel — stamped here so dashboard, billing,
      // and commission tracking all work correctly
      childPanelOwner: childPanelOwnerId,
      childPanelCommission,
      childPanelEarningsCredited: false,
      childPanelPerOrderFee,

      category: serviceData.category,
      service,
      serviceId: serviceData.serviceId || serviceData._id.toString(),
      rate: Number(serviceData.rate || 0),
      link,
      quantity: qty,
      charge: finalCharge,
      status: "pending",
      isFreeOrder,
      earningsCredited: false,
      isCharged: !isFreeOrder,

      provider: serviceData.provider,
      providerApiUrl: serviceData.providerApiUrl,
      providerServiceId: serviceData.providerServiceId,
      providerProfileId: serviceData.providerProfileId,

      cancelAllowed: serviceData.cancelAllowed,
      refillAllowed: serviceData.refillAllowed,

      refillPolicy: serviceData.refillAllowed
        ? serviceData.refillPolicy || "none"
        : "none",

      customRefillDays: serviceData.refillAllowed
        ? serviceData.refillPolicy === "custom"
          ? serviceData.customRefillDays || null
          : null
        : null,
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
      /* ================= SAFE REFUND ON PROVIDER FAILURE ================= */

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
      order.refundProcessed = true;

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
      userId: req.user._id,
    };

    if (search && search.trim() !== "") {
      const cleanSearch = search.replace("#", "").trim();

      const orConditions = [
        { service: { $regex: cleanSearch, $options: "i" } },
        { link: { $regex: cleanSearch, $options: "i" } },
      ];

      if (!isNaN(cleanSearch)) {
        orConditions.push({ customOrderId: Number(cleanSearch) });
      }

      query.$or = orConditions;
    }

    if (status) {
      query.status = status;
    }

    if (fromDate || toDate) {
      query.createdAt = {};
      if (fromDate) query.createdAt.$gte = new Date(fromDate);
      if (toDate) {
        const end = new Date(toDate);
        end.setHours(23, 59, 59, 999);
        query.createdAt.$lte = end;
      }
    }

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
      return res.json({ finalCharge: 0, baseCharge: 0, isFree: true });
    }

    const user = await User.findById(req.user._id);
    const providerRate = Number(serviceData.rate || 0);
    let finalRate;

    // ── CP-OWNED SERVICE ──
    // Admin commission does NOT apply. Only CP owner's commission applies.
    if (serviceData.cpOwner) {
      let cpCommissionRate = 0;

      if (user?.childPanelOwner) {
        const cpOwner = await User.findById(user.childPanelOwner);
        cpCommissionRate = Number(cpOwner?.childPanelCommissionRate || 0);
      } else if (serviceData.cpOwner) {
        // The ordering user IS on a CP — find the CP owner by cpOwner field
        const cpOwner = await User.findById(serviceData.cpOwner);
        cpCommissionRate = Number(cpOwner?.childPanelCommissionRate || 0);
      }

      finalRate = providerRate + (providerRate * cpCommissionRate) / 100;
    } else {
      // ── MAIN PLATFORM SERVICE ──
      const settings = await Settings.findOne().lean();
      const adminRate = Number(settings?.commission || 0);
      const systemRate = providerRate + (providerRate * adminRate) / 100;

      finalRate = systemRate;

      if (user?.resellerOwner) {
        const reseller = await User.findById(user.resellerOwner);
        const rRate = Number(reseller?.resellerCommissionRate || 0);
        finalRate = systemRate + (systemRate * rRate) / 100;
      }
    }

    const baseCharge = (qty / 1000) * providerRate;
    const finalCharge = (qty / 1000) * finalRate;

    res.json({
      baseCharge,
      finalCharge,
      finalRate,
      isFree: false,
    });
  } catch (error) {
    console.error("Preview error:", error);
    res.status(500).json({ message: "Preview failed" });
  }
};
/* =========================================================
GET MY ORDERS STATS
========================================================= */
export const getMyOrdersStats = async (req, res) => {
  try {
    const { search, status, fromDate, toDate } = req.query;

    const match = {
      userId: req.user._id,
    };

    if (status) match.status = status;

    if (fromDate || toDate) {
      match.createdAt = {};
      if (fromDate) match.createdAt.$gte = new Date(fromDate);
      if (toDate) match.createdAt.$lte = new Date(toDate);
    }

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
