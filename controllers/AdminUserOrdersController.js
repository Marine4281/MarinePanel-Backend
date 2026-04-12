//controllers/AdminUserOrdersController.js
import Order from "../models/Order.js";
import User from "../models/User.js";
import Wallet from "../models/Wallet.js";
import { 
  creditResellerCommission,
  reverseResellerCommission // ✅ ADDED
} from "./orderController.js";

/* ======================================================
   GET ALL USER ORDERS (Search + Pagination)
====================================================== */
export const getUserOrders = async (req, res) => {
  try {
    const {
      search = "",
      status,
      fromDate,
      toDate,
      page = 1,
      limit = 10,
    } = req.query;

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.max(1, Number(limit));

    let query = {};

    /* ===============================
       STATUS FILTER
    =============================== */
    if (status) {
      query.status = status;
    }

    /* ===============================
       DATE FILTER
    =============================== */
    if (fromDate || toDate) {
      query.createdAt = {};

      if (fromDate) {
        query.createdAt.$gte = new Date(fromDate);
      }

      if (toDate) {
        const end = new Date(toDate);
        end.setHours(23, 59, 59, 999); // ✅ full day
        query.createdAt.$lte = end;
      }
    }

    /* ===============================
       SEARCH (SAFE)
    =============================== */
    if (search && search.trim() !== "") {
      const cleanSearch = search.replace("#", "").trim();

      // 🔍 Find users by email
      const users = await User.find({
        email: { $regex: cleanSearch, $options: "i" },
      }).select("_id");

      const userIds = users.map((u) => u._id);

      const orConditions = [
        { orderId: { $regex: cleanSearch, $options: "i" } }, // string
        { service: { $regex: cleanSearch, $options: "i" } },
        { provider: { $regex: cleanSearch, $options: "i" } },
        { link: { $regex: cleanSearch, $options: "i" } },
      ];

      // ✅ numeric-safe search
      if (!isNaN(cleanSearch)) {
        orConditions.push({ customOrderId: Number(cleanSearch) }); // FIXED
        orConditions.push({ rate: Number(cleanSearch) });
      }

      // ✅ user email match
      if (userIds.length > 0) {
        orConditions.push({ userId: { $in: userIds } });
      }

      query.$or = orConditions;
    }

    /* ===============================
       FETCH
    =============================== */
    const [orders, total] = await Promise.all([
      Order.find(query)
        .populate("userId", "email balance")
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),

      Order.countDocuments(query),
    ]);

    res.json({
      orders,
      totalPages: Math.ceil(total / limitNum),
    });

  } catch (error) {
    console.error("Get Orders Error:", error);
    res.status(500).json({ message: "Failed to fetch orders" });
  }
};

/* ======================================================
   UPDATE ORDER STATUS (Safe Manual Control)
====================================================== */
export const updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;

    const allowedStatuses = [
      "pending",
      "processing",
      "partial",
      "completed",
      "failed",
      "cancelled",
      "refunded",
    ];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const order = await Order.findById(req.params.id);

    if (!order)
      return res.status(404).json({ message: "Order not found" });

    if (order.status === "refunded") {
      return res.status(400).json({
        message: "Cannot modify a refunded order",
      });
    }

    if (order.status === "completed" && status !== "completed") {
      return res.status(400).json({
        message: "Completed order cannot be modified",
      });
    }

    if (status === "partial" && order.quantityDelivered === 0) {
      return res.status(400).json({
        message: "Partial requires delivered quantity",
      });
    }

    order.status = status;

    if (status === "completed") {
      order.quantityDelivered = order.quantity;
    }

    await order.save();

    // 💰 CREDIT RESELLER (SAFE)
    if (order.status === "completed") {
      await creditResellerCommission(order);
    }

    const io = req.app.get("io");

    if (io) {
      io.emit("order:update", {
        _id: order._id,
        status: order.status,
        quantityDelivered: order.quantityDelivered,
      });
    }

    res.json({ message: "Status updated", order });
  } catch (error) {
    console.error("Update Status Error:", error);
    res.status(500).json({ message: "Failed to update status" });
  }
};

/* ======================================================
   UPDATE ORDER PROGRESS (ADMIN MANUAL)
====================================================== */
export const updateOrderProgress = async (req, res) => {
  try {
    const { quantityDelivered } = req.body;

    const order = await Order.findById(req.params.id);

    if (!order)
      return res.status(404).json({ message: "Order not found" });

    if (order.status === "refunded") {
      return res.status(400).json({
        message: "Cannot edit refunded order",
      });
    }

    if (order.status === "completed") {
      return res.status(400).json({
        message: "Completed order cannot be edited",
      });
    }

    const delivered = Number(quantityDelivered);

    if (isNaN(delivered) || delivered < 0) {
      return res.status(400).json({
        message: "Invalid quantity",
      });
    }

    if (delivered > order.quantity) {
      return res.status(400).json({
        message: "Delivered cannot exceed total quantity",
      });
    }

    if (delivered < order.quantityDelivered) {
      return res.status(400).json({
        message: "Cannot reduce delivered quantity",
      });
    }

    order.quantityDelivered = delivered;

    if (delivered === order.quantity) {
      order.status = "completed";
    } else if (delivered > 0) {
      order.status = "processing";
    }

    await order.save();

    // 💰 CREDIT RESELLER (SAFE)
    if (order.status === "completed") {
      await creditResellerCommission(order);
    }

    const io = req.app.get("io");

    if (io) {
      io.emit("order:update", {
        _id: order._id,
        status: order.status,
        quantityDelivered: order.quantityDelivered,
      });
    }

    res.json({
      message: "Progress updated",
      order,
    });
  } catch (error) {
    console.error("Update Progress Error:", error);
    res.status(500).json({
      message: "Failed to update progress",
    });
  }
};

/* ======================================================
   REFUND ORDER (FULL / PARTIAL / CUSTOM)
====================================================== */
export const refundOrder = async (req, res) => {
  try {
    const { type, customAmount } = req.body;

    const order = await Order.findById(req.params.id)
      .populate("userId");

    if (!order)
      return res.status(404).json({ message: "Order not found" });

    if (order.isFreeOrder) {
      return res.status(400).json({
        message: "Free orders cannot be refunded",
      });
    }

    if (order.refundProcessed) {
      return res.status(400).json({
        message: "Refund already processed",
      });
    }

    let wallet = await Wallet.findOne({ user: order.userId._id });

    if (!wallet) {
      wallet = await Wallet.create({
        user: order.userId._id,
        balance: 0,
        transactions: [],
      });
    }

    let refundAmount = 0;

    if (type === "full") {
      refundAmount = order.charge;
    } else if (type === "partial") {
      const remaining = order.quantity - order.quantityDelivered;

      if (remaining <= 0) {
        return res.status(400).json({
          message: "Nothing left to refund",
        });
      }

      refundAmount =
        (remaining / order.quantity) * order.charge;
    } else if (type === "custom") {
      if (!customAmount || customAmount <= 0) {
        return res.status(400).json({
          message: "Invalid custom refund amount",
        });
      }

      refundAmount = Number(customAmount);
    } else {
      return res.status(400).json({
        message: "Invalid refund type",
      });
    }

    refundAmount = Number(refundAmount.toFixed(4));

    wallet.transactions.push({
      type: "Refund",
      amount: refundAmount,
      status: "Completed",
      note: `Refund for Order ${order.orderId}`,
    });

    wallet.balance += refundAmount;

    await wallet.save();

    order.status = "refunded";
    order.refundProcessed = true;

    await order.save();

    // 💸 REVERSE RESELLER COMMISSION (CRITICAL FIX)
    await reverseResellerCommission(order);

    const io = req.app.get("io");

    if (io) {
      io.emit("order:update", {
        _id: order._id,
        status: "refunded",
        quantityDelivered: order.quantityDelivered,
      });

      io.emit("wallet:update", {
        userId: order.userId._id,
        balance: wallet.balance,
      });
    }

    res.json({
      message: "Refund successful",
      refundAmount,
    });

  } catch (error) {
    console.error("Refund Error:", error);
    res.status(500).json({ message: "Refund failed" });
  }
};

/* =====================================================
   GET GLOBAL ORDER STATS
===================================================== */
export const getOrderStats = async (req, res) => {
  try {
    const { search, status, fromDate, toDate } = req.query;

    const match = {};

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

      const users = await User.find({
        email: regex,
      }).select("_id");

      const userIds = users.map((u) => u._id);

      match.$or = [
        { orderId: regex },
        { customOrderId: regex },
        { service: regex },
        { provider: regex },
        { link: regex },
        { userId: { $in: userIds } },
        ...(!isNaN(search) ? [{ rate: Number(search) }] : []),
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
    console.error("Stats error:", err);
    res.status(500).json({ message: "Failed to fetch stats" });
  }
};
