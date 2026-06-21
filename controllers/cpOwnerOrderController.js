// controllers/cpOwnerOrderController.js
import mongoose from "mongoose";
import Order from "../models/Order.js";
import Wallet from "../models/Wallet.js";
import User from "../models/User.js";
import logCpAdminAction from "../utils/logCpAdminAction.js";
import { formatProviderStatusDisplay } from "../utils/providerStatusMapper.js";
import {
  creditChildPanelCommission,
  reverseChildPanelCommission,
} from "./orderController.js";

// ======================= HELPERS =======================

const calculateBalance = (transactions = []) =>
  transactions
    .filter((t) => t.status === "Completed")
    .reduce((acc, t) => acc + (Number(t.amount) || 0), 0);

const formatOrder = (order) => {
  // For direct CP domain end-users: endUserId holds the real end user
  // For CP-reseller end-users: endUserId is null, but userId is the end user
  //   (because req.childPanel was not set, so orderUserId = user._id)
  const displayUser = order.endUserId || order.userId;
  const isPopulated = displayUser && typeof displayUser === "object" && displayUser.email;

  // Determine if this order came via a CP reseller (no endUserId but has resellerOwner)
  const isResellerEndUserOrder = !order.endUserId && !!order.resellerOwner;

  return {
    _id: order._id,
    orderId: order.orderId,
    customOrderId: order.customOrderId,
    service: order.service,
    serviceId: order.serviceId,
    category: order.category,
    provider: order.provider,
    rate: order.rate,
    link: order.link,
    quantity: order.quantity,
    quantityDelivered: order.quantityDelivered || 0,
    charge: order.charge,
    childPanelCommission: order.childPanelCommission || 0,
    status: order.status,
    providerStatus: order.providerStatus,
    displayStatus: formatProviderStatusDisplay(order),
    createdAt: order.createdAt,
    refundProcessed: order.refundProcessed || false,
    placedViaChildPanel: order.placedViaChildPanel || false,
    isOwnOrder: !order.endUserId && !isResellerEndUserOrder,
    isResellerEndUserOrder,
    user: isPopulated
      ? {
          _id: displayUser._id,
          email: displayUser.email,
          username: displayUser.email?.split("@")[0] || "",
          balance: displayUser.balance || 0,
        }
      : { _id: displayUser?._id || null, email: "Unknown", username: "", balance: 0 },
  };
};

// ======================= PROCESS REFUND =======================

const processRefund = async ({ order, refundType = "full", customAmount = 0 }) => {
  if (!order || order.refundProcessed) return null;

  const payerId = order.endUserId || order.userId;

  const wallet = await Wallet.findOne({ user: payerId });
  if (!wallet) return null;

  const alreadyRefunded = wallet.transactions.find(
    (t) =>
      t.reference?.toString() === order._id.toString() && t.type === "Refund"
  );
  if (alreadyRefunded) return null;

  let refundAmount = 0;

  if (refundType === "full") {
    refundAmount = Number(order.charge || 0);
  } else if (refundType === "partial") {
    const remaining = Number(order.quantity || 0) - Number(order.quantityDelivered || 0);
    if (remaining <= 0) return null;
    refundAmount = (remaining / Number(order.quantity || 1)) * Number(order.charge || 0);
  } else if (refundType === "custom") {
    refundAmount = Number(customAmount || 0);
    if (refundAmount <= 0) return null;
  }

  refundAmount = Number(refundAmount.toFixed(4));
  if (refundAmount <= 0) return null;

  wallet.transactions.push({
    type: "Refund",
    amount: refundAmount,
    status: "Completed",
    note: `Refund for Order #${order.customOrderId || order.orderId}`,
    reference: order._id,
    createdAt: new Date(),
  });

  wallet.balance = wallet.transactions.reduce(
    (acc, t) => acc + (Number(t.amount) || 0),
    0
  );
  await wallet.save();

  await User.findByIdAndUpdate(payerId, { balance: wallet.balance });

  order.refundProcessed = true;
  await order.save();

  await reverseChildPanelCommission(order);

  return { refundAmount, walletBalance: wallet.balance, walletUserId: payerId };
};

// ======================= GET ALL ORDERS =======================

export const getCPOrders = async (req, res) => {
  try {
    const { search = "", status, fromDate, toDate, page = 1, limit = 20 } = req.query;

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.max(1, Number(limit));

    let orderQuery = { childPanelOwner: req.user._id };

    if (status) orderQuery.status = status;

    if (fromDate || toDate) {
      orderQuery.createdAt = {};
      if (fromDate) orderQuery.createdAt.$gte = new Date(fromDate);
      if (toDate) {
        const end = new Date(toDate);
        end.setHours(23, 59, 59, 999);
        orderQuery.createdAt.$lte = end;
      }
    }

    if (search && search.trim()) {
      const clean = search.replace("#", "").trim();

      const users = await User.find({
        email: { $regex: clean, $options: "i" },
        childPanelOwner: req.user._id,
      }).select("_id");

      const userIds = users.map((u) => u._id);
      const orQueries = [
        { orderId: { $regex: clean, $options: "i" } },
        { service: { $regex: clean, $options: "i" } },
        { link: { $regex: clean, $options: "i" } },
        { provider: { $regex: clean, $options: "i" } },
      ];

      if (!isNaN(clean)) {
        orQueries.push({ customOrderId: Number(clean) });
        orQueries.push({ rate: Number(clean) });
      }
      if (userIds.length > 0) orQueries.push({ endUserId: { $in: userIds } });

      orderQuery = {
        childPanelOwner: req.user._id,
        ...(status ? { status } : {}),
        $or: orQueries,
      };
    }

    const [ordersRaw, total] = await Promise.all([
      Order.find(orderQuery)
        .populate({ path: "endUserId", select: "email balance" })
        .populate({ path: "userId", select: "email balance" })
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      Order.countDocuments(orderQuery),
    ]);

    const orders = ordersRaw.map(formatOrder);

    res.json({ orders, totalPages: Math.ceil(total / limitNum) });
  } catch (err) {
    console.error("CP GET ALL ORDERS ERROR:", err);
    res.status(500).json({ message: "Failed to fetch orders" });
  }
};

// ======================= GET STATS =======================

export const getCPOrderStats = async (req, res) => {
  try {
    const { search, status, fromDate, toDate } = req.query;
    const ownerId = req.user._id;

    const match = { childPanelOwner: ownerId };

    if (status) match.status = status;
    if (fromDate || toDate) {
      match.createdAt = {};
      if (fromDate) match.createdAt.$gte = new Date(fromDate);
      if (toDate) {
        const end = new Date(toDate);
        end.setHours(23, 59, 59, 999);
        match.createdAt.$lte = end;
      }
    }

    if (search && search.trim()) {
      const clean = search.replace("#", "").trim();
      const users = await User.find({
        email: { $regex: clean, $options: "i" },
        childPanelOwner: ownerId,
      }).select("_id");
      const userIds = users.map((u) => u._id);
      const orQueries = [
        { orderId: { $regex: clean, $options: "i" } },
        { service: { $regex: clean, $options: "i" } },
      ];
      if (userIds.length > 0) orQueries.push({ endUserId: { $in: userIds } });
      match.$or = orQueries;
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

    const r = stats[0];
    res.json({
      total: r.total[0]?.count || 0,
      pending: r.pending[0]?.count || 0,
      processing: r.processing[0]?.count || 0,
      completed: r.completed[0]?.count || 0,
      partial: r.partial[0]?.count || 0,
      failed: r.failed[0]?.count || 0,
    });
  } catch (err) {
    console.error("CP STATS ERROR:", err);
    res.status(500).json({ message: "Failed to fetch stats" });
  }
};

// ======================= UPDATE STATUS =======================

export const updateCPOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const ALLOWED = ["pending", "processing", "partial", "completed", "failed", "refunded"];

    if (!ALLOWED.includes(status))
      return res.status(400).json({ message: "Invalid status" });

    const order = await Order.findOne({
      _id: req.params.id,
      childPanelOwner: req.user._id,
    })
      .populate({ path: "endUserId", select: "email balance" })
      .populate({ path: "userId", select: "email balance" });

    if (!order) return res.status(404).json({ message: "Order not found" });
    if (order.status === "refunded")
      return res.status(400).json({ message: "Cannot modify a refunded order" });
    if (order.status === "completed" && status !== "completed")
      return res.status(400).json({ message: "Completed order cannot be modified" });

    order.status = status;
    order.providerStatus = status; // ✅ keep displayStatus in sync for manual overrides

    if (status === "completed") {
      order.quantityDelivered = order.quantity;
      await creditChildPanelCommission(order);
    }

    let refundData = null;
    if (status === "failed") {
      refundData = await processRefund({ order, refundType: "full" });
    }
    if (status === "partial") {
      refundData = await processRefund({ order, refundType: "partial" });
    }

    await order.save();

    const io = req.app.get("io");
    if (io) {
      io.emit("order:update", formatOrder(order));

      const notifyUserId = order.endUserId?._id || order.endUserId || order.userId?._id || order.userId;
      if (notifyUserId) {
        io.to(notifyUserId.toString()).emit("orderUpdated", {
          orderId: order._id,
          status: order.status,
          providerStatus: order.providerStatus || order.status,
          delivered: order.quantityDelivered,
          total: order.quantity,
          refundProcessed: order.refundProcessed,
        });
      }

      if (refundData) {
        io.emit("wallet:update", {
          userId: refundData.walletUserId,
          balance: refundData.walletBalance,
        });
      }
    }

    logCpAdminAction({
      adminId: req.user._id,
      adminEmail: req.user.email,
      childPanelId: req.user._id,
      action: "COMPLETE_ORDER",
      targetType: "Order",
      targetId: order._id,
      description: `Updated order ${order._id} status to ${status}`,
      ipAddress: req.ip,
    }).catch(() => {});

    res.json({
      message: "Status updated",
      order: formatOrder(order),
      refundAmount: refundData?.refundAmount || 0,
    });
  } catch (err) {
    console.error("CP UPDATE STATUS ERROR:", err);
    res.status(500).json({ message: "Failed to update status" });
  }
};

// ======================= UPDATE PROGRESS =======================

export const updateCPOrderProgress = async (req, res) => {
  try {
    const { quantityDelivered } = req.body;

    const order = await Order.findOne({
      _id: req.params.id,
      childPanelOwner: req.user._id,
    })
      .populate({ path: "endUserId", select: "email balance" })
      .populate({ path: "userId", select: "email balance" });

    if (!order) return res.status(404).json({ message: "Order not found" });
    if (order.status === "refunded")
      return res.status(400).json({ message: "Cannot edit refunded order" });
    if (order.status === "completed")
      return res.status(400).json({ message: "Cannot edit completed order" });

    const delivered = Number(quantityDelivered);
    if (isNaN(delivered) || delivered < 0)
      return res.status(400).json({ message: "Invalid quantity" });
    if (delivered > order.quantity)
      return res.status(400).json({ message: "Delivered cannot exceed total quantity" });

    order.quantityDelivered = delivered;
    if (delivered === order.quantity) {
      order.status = "completed";
      await creditChildPanelCommission(order);
    } else if (delivered > 0) {
      order.status = "processing";
    }

    order.providerStatus = order.status; // ✅ keep displayStatus in sync for manual overrides

    await order.save();

    const io = req.app.get("io");
    if (io) io.emit("order:update", formatOrder(order));

    res.json({ message: "Progress updated", order: formatOrder(order) });
  } catch (err) {
    console.error("CP UPDATE PROGRESS ERROR:", err);
    res.status(500).json({ message: "Failed to update progress" });
  }
};

// ======================= REFUND (FULL / PARTIAL / CUSTOM) =======================

export const refundCPOrder = async (req, res) => {
  try {
    const { type, customAmount } = req.body;

    const order = await Order.findOne({
      _id: req.params.id,
      childPanelOwner: req.user._id,
    })
      .populate({ path: "endUserId", select: "email balance" })
      .populate({ path: "userId", select: "email balance" });

    if (!order) return res.status(404).json({ message: "Order not found" });
    if (order.status === "refunded")
      return res.status(400).json({ message: "Already refunded" });

    const refundData = await processRefund({ order, refundType: type, customAmount });

    if (!refundData)
      return res.status(400).json({ message: "Refund failed or already processed" });

    order.status = "refunded";
    order.providerStatus = "refunded"; // ✅ keep displayStatus in sync for manual overrides

    await order.save();

    const io = req.app.get("io");
    if (io) {
      io.emit("order:update", formatOrder(order));

      const notifyUserId = order.endUserId?._id || order.endUserId || order.userId?._id || order.userId;
      if (notifyUserId) {
        io.to(notifyUserId.toString()).emit("orderUpdated", {
          orderId: order._id,
          status: order.status,
          providerStatus: order.providerStatus || order.status,
          delivered: order.quantityDelivered,
          total: order.quantity,
          refundProcessed: order.refundProcessed,
        });
      }

      io.emit("wallet:update", {
        userId: refundData.walletUserId,
        balance: refundData.walletBalance,
      });
    }

    logCpAdminAction({
      adminId: req.user._id,
      adminEmail: req.user.email,
      childPanelId: req.user._id,
      action: "REFUND_ORDER",
      targetType: "Order",
      targetId: order._id,
      description: `Refunded order ${order._id}`,
      ipAddress: req.ip,
    }).catch(() => {});

    res.json({ message: "Refund successful", refundAmount: refundData.refundAmount });
  } catch (err) {
    console.error("CP REFUND ORDER ERROR:", err);
    res.status(500).json({ message: "Failed to refund order" });
  }
};

// ======================= WALLET STATS =======================

export const getCPWalletStats = async (req, res) => {
  try {
    const ownerId = req.user._id;

    const cpUsers = await User.find({ childPanelOwner: ownerId }).select("_id");
    const cpUserIds = cpUsers.map((u) => u._id);

    const wallets = await Wallet.find({ user: { $in: cpUserIds } });

    let totalBalance = 0;
    let totalUsed = 0;

    wallets.forEach((wallet) => {
      const completed = wallet.transactions.filter((t) => t.status === "Completed");
      const moneyIn = completed.filter((t) => t.amount > 0).reduce((acc, t) => acc + t.amount, 0);
      const moneyOut = completed.filter((t) => t.amount < 0).reduce((acc, t) => acc + Math.abs(t.amount), 0);
      totalBalance += moneyIn - moneyOut;
      totalUsed += moneyOut;
    });

    res.json({
      totalBalance: Number(totalBalance.toFixed(2)),
      totalUsed: Number(totalUsed.toFixed(2)),
    });
  } catch (err) {
    console.error("CP WALLET STATS ERROR:", err);
    res.status(500).json({ message: "Failed to fetch wallet stats" });
  }
};
