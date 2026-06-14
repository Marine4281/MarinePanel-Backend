//controllers/AdminUserOrdersController.js
import Order from "../models/Order.js";
import User from "../models/User.js";
import Wallet from "../models/Wallet.js";
import {
  creditResellerCommission,
  reverseResellerCommission,
} from "./orderController.js";

/* ======================================================
   HELPER: PROCESS REFUND
====================================================== */
const processRefund = async ({
  order,
  refundType = "full",
  customAmount = 0,
}) => {
  if (!order) return;
  if (order.isFreeOrder) return;
  if (order.refundProcessed) return;
  if (!order.isCharged) return;

  const payerId = order.endUserId || order.userId;

  const wallet = await Wallet.findOne({ user: payerId });

  if (!wallet) return;

  const alreadyRefunded = wallet.transactions.find(
    (t) =>
      t.reference?.toString() === order._id.toString() &&
      t.type === "Refund"
  );

  if (alreadyRefunded) return;

  let refundAmount = 0;

  if (refundType === "full") {
    refundAmount = Number(order.charge || 0);
  } else if (refundType === "partial") {
    const remaining =
      Number(order.quantity || 0) -
      Number(order.quantityDelivered || 0);

    if (remaining <= 0) return;

    refundAmount =
      (remaining / Number(order.quantity || 1)) *
      Number(order.charge || 0);
  } else if (refundType === "custom") {
    refundAmount = Number(customAmount || 0);
    if (refundAmount <= 0) return;
  }

  refundAmount = Number(refundAmount.toFixed(4));

  if (refundAmount <= 0) return;

  wallet.transactions.push({
    type: "Refund",
    amount: refundAmount,
    status: "Completed",
    note: `Refund for Order ${order.orderId}`,
    reference: order._id,
    createdAt: new Date(),
  });

  wallet.balance = wallet.transactions.reduce(
    (acc, t) => acc + (Number(t.amount) || 0),
    0
  );

  await wallet.save();

  order.refundProcessed = true;
  await order.save();

  await reverseResellerCommission(order);

  return {
    refundAmount,
    walletBalance: wallet.balance,
    walletUserId: payerId,
  };
};

/* ======================================================
   HELPER: EMIT ORDER UPDATED TO USER ROOM
====================================================== */
const emitOrderUpdated = (io, order, refundData = null) => {
  // Broadcast to admin pages
  io.emit("order:update", {
    _id: order._id,
    status: order.status,
    quantityDelivered: order.quantityDelivered,
  });

  // ✅ Target the end-user's socket room so their Orders page updates live
  const notifyUserId =
    order.endUserId?._id || order.endUserId ||
    order.userId?._id || order.userId;

  if (notifyUserId) {
    io.to(notifyUserId.toString()).emit("orderUpdated", {
      orderId: order._id,
      status: order.status,
      providerStatus: order.providerStatus || order.status,
      delivered: order.quantityDelivered,
      total: order.quantity,
      refundProcessed: order.refundProcessed || false,
    });
  }

  if (refundData) {
    io.emit("wallet:update", {
      userId: refundData.walletUserId,
      balance: refundData.walletBalance,
    });
  }
};

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

    const cpEndUserIds = await User.find({
      childPanelOwner: { $ne: null },
    }).distinct("_id");

    const baseFilter = cpEndUserIds.length > 0
      ? {
          $or: [
            { childPanelOwner: { $ne: null }, placedViaChildPanel: true },
            { childPanelOwner: null, userId: { $nin: cpEndUserIds } },
          ],
        }
      : { childPanelOwner: null };

    let query = { ...baseFilter };

    if (status) {
      query.status = status;
    }

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

    if (search && search.trim() !== "") {
      const cleanSearch = search.replace("#", "").trim();

      const users = await User.find({
        email: { $regex: cleanSearch, $options: "i" },
        childPanelOwner: null,
      }).select("_id");

      const userIds = users.map((u) => u._id);

      const orConditions = [
        { orderId: { $regex: cleanSearch, $options: "i" } },
        { service: { $regex: cleanSearch, $options: "i" } },
        { provider: { $regex: cleanSearch, $options: "i" } },
        { link: { $regex: cleanSearch, $options: "i" } },
      ];

      if (!isNaN(cleanSearch)) {
        orConditions.push({ customOrderId: Number(cleanSearch) });
        orConditions.push({ rate: Number(cleanSearch) });
      }

      if (userIds.length > 0) {
        orConditions.push({ userId: { $in: userIds } });
        orConditions.push({ childPanelOwner: { $in: userIds } });
      }

      query = {
        $and: [
          baseFilter,
          { $or: orConditions },
        ],
      };

      if (status) query.status = status;

      if (fromDate || toDate) {
        query.createdAt = {};
        if (fromDate) query.createdAt.$gte = new Date(fromDate);
        if (toDate) {
          const end = new Date(toDate);
          end.setHours(23, 59, 59, 999);
          query.createdAt.$lte = end;
        }
      }
    }

    const [orders, total] = await Promise.all([
      Order.find(query)
        .populate("userId", "email balance")
        .populate("childPanelOwner", "email balance")
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),

      Order.countDocuments(query),
    ]);

    const formattedOrders = orders.map((order) => {
      const isCPOrder = !!(order.childPanelOwner && order.childPanelOwner._id);

      const displayUser = isCPOrder
        ? order.childPanelOwner
        : order.userId;

      return {
        ...order,
        isChildPanelOrder: isCPOrder,
        userId: displayUser,
        charge: isCPOrder
          ? (order.cpOwnerCharge ?? order.charge)
          : order.charge,
        endUserCharge: order.charge,
      };
    });

    res.json({
      orders: formattedOrders,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (error) {
    console.error("Get Orders Error:", error);

    res.status(500).json({
      message: "Failed to fetch orders",
    });
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

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (order.status === "refunded") {
      return res.status(400).json({ message: "Cannot modify a refunded order" });
    }

    if (order.status === "completed" && status !== "completed") {
      return res.status(400).json({ message: "Completed order cannot be modified" });
    }

    order.status = status;

    if (status === "completed") {
      order.quantityDelivered = order.quantity;
    }

    await order.save();

    let refundData = null;

    if (status === "failed") {
      refundData = await processRefund({ order, refundType: "full" });
    }

    if (status === "partial") {
      refundData = await processRefund({ order, refundType: "partial" });
    }

    if (order.status === "completed") {
      await creditResellerCommission(order);
    }

    const io = req.app.get("io");
    if (io) emitOrderUpdated(io, order, refundData);

    res.json({
      message: "Status updated",
      order,
      refundAmount: refundData?.refundAmount || 0,
    });
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
      return res.status(400).json({ message: "Cannot edit refunded order" });
    }

    if (order.status === "completed") {
      return res.status(400).json({ message: "Completed order cannot be edited" });
    }

    const delivered = Number(quantityDelivered);

    if (isNaN(delivered) || delivered < 0) {
      return res.status(400).json({ message: "Invalid quantity" });
    }

    if (delivered > order.quantity) {
      return res.status(400).json({ message: "Delivered cannot exceed total quantity" });
    }

    if (delivered < order.quantityDelivered) {
      return res.status(400).json({ message: "Cannot reduce delivered quantity" });
    }

    order.quantityDelivered = delivered;

    if (delivered === order.quantity) {
      order.status = "completed";
    } else if (delivered > 0) {
      order.status = "processing";
    }

    await order.save();

    if (order.status === "completed") {
      await creditResellerCommission(order);
    }

    const io = req.app.get("io");
    if (io) emitOrderUpdated(io, order);

    res.json({ message: "Progress updated", order });
  } catch (error) {
    console.error("Update Progress Error:", error);
    res.status(500).json({ message: "Failed to update progress" });
  }
};

/* ======================================================
   REFUND ORDER (FULL / PARTIAL / CUSTOM)
====================================================== */
export const refundOrder = async (req, res) => {
  try {
    const { type, customAmount } = req.body;

    const order = await Order.findById(req.params.id).populate("userId");

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    const refundData = await processRefund({
      order,
      refundType: type,
      customAmount,
    });

    if (!refundData) {
      return res.status(400).json({ message: "Refund failed or already processed" });
    }

    order.status = "refunded";

    await order.save();

    const io = req.app.get("io");
    if (io) emitOrderUpdated(io, order, refundData);

    res.json({
      message: "Refund successful",
      refundAmount: refundData.refundAmount,
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

    const cpEndUserIds = await User.find({
      childPanelOwner: { $ne: null },
    }).distinct("_id");

    const baseFilter = cpEndUserIds.length > 0
      ? {
          $or: [
            { childPanelOwner: { $ne: null }, placedViaChildPanel: true },
            { childPanelOwner: null, userId: { $nin: cpEndUserIds } },
          ],
        }
      : { childPanelOwner: null };

    const match = { ...baseFilter };

    if (status) match.status = status;

    if (fromDate || toDate) {
      match.createdAt = {};

      if (fromDate) {
        match.createdAt.$gte = new Date(fromDate);
      }

      if (toDate) {
        match.createdAt.$lte = new Date(toDate);
      }
    }

    if (search) {
      const regex = new RegExp(search, "i");

      const users = await User.find({
        email: regex,
        childPanelOwner: null,
      }).select("_id");

      const userIds = users.map((u) => u._id);

      match.$or = [
        { orderId: regex },
        { customOrderId: regex },
        { service: regex },
        { provider: regex },
        { link: regex },
        { userId: { $in: userIds } },
        { childPanelOwner: { $in: userIds } },
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
