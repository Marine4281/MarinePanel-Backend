// controllers/cpOwnerOrderController.js
//
// Child panel owner managing orders within their panel.
// Every query is scoped to childPanelOwner: req.user._id
// so it is impossible to read or modify orders from another panel.
// Mirrors adminOrderController.js — same operations, different scope.
// complete and refund also trigger child panel commission
// credit/reversal via the helpers in orderController.js.

import mongoose from "mongoose";
import Order from "../models/Order.js";
import Wallet from "../models/Wallet.js";
import User from "../models/User.js";
import {
  creditChildPanelCommission,
  reverseChildPanelCommission,
} from "./orderController.js";

// ======================= HELPERS =======================

const calculateBalance = (transactions = []) =>
  transactions
    .filter((t) => t.status === "Completed")
    .reduce((acc, t) => acc + (Number(t.amount) || 0), 0);

const formatOrder = (order) => ({
  _id: order._id,
  orderId: order.orderId,
  customOrderId: order.customOrderId,
  service: order.service,
  link: order.link,
  quantity: order.quantity,
  quantityDelivered: order.quantityDelivered || 0,
  charge: order.charge,
  status: order.status,
  providerStatus: order.providerStatus,
  createdAt: order.createdAt,
  user: order.userId
    ? {
        _id: order.userId._id,
        email: order.userId.email,
        username: order.userId.email?.split("@")[0] || "",
        balance: order.userId.balance || 0,
      }
    : { _id: null, email: "Unknown", username: "", balance: 0 },
});

// ======================= GET ALL ORDERS =======================
// Paginated, searchable — scoped to this child panel only

export const getCPOrders = async (req, res) => {
  try {
    const { search = "", page = 1, limit = 10 } = req.query;

    const pageNum = Number(page);
    const limitNum = Number(limit);

    // Base scope — only orders belonging to this child panel
    let orderQuery = { childPanelOwner: req.user._id };

    if (search) {
      // Search users within this child panel only
      const users = await User.find({
        email: { $regex: search, $options: "i" },
        childPanelOwner: req.user._id,
      }).select("_id");

      const userIds = users.map((u) => u._id);
      const orQueries = [];

      if (userIds.length > 0) orQueries.push({ userId: { $in: userIds } });
      if (mongoose.Types.ObjectId.isValid(search)) orQueries.push({ _id: search });
      orQueries.push({ orderId: { $regex: search, $options: "i" } });
      if (!isNaN(search)) orQueries.push({ customOrderId: Number(search) });

      // Must stay scoped — merge with childPanelOwner filter
      orderQuery = {
        childPanelOwner: req.user._id,
        $or: orQueries,
      };
    }

    const totalOrders = await Order.countDocuments(orderQuery);
    const totalPages = Math.ceil(totalOrders / limitNum);

    const ordersRaw = await Order.find(orderQuery)
      .populate({ path: "userId", select: "email balance" })
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean();

    const orders = ordersRaw.map((order) => ({
      _id: order._id,
      orderId: order.orderId,
      customOrderId: order.customOrderId,
      service: order.service,
      link: order.link,
      quantity: order.quantity,
      quantityDelivered: order.quantityDelivered || 0,
      charge: order.charge,
      status: order.status,
      providerStatus: order.providerStatus,
      createdAt: order.createdAt,
      user: order.userId
        ? {
            _id: order.userId._id,
            email: order.userId.email,
            username: order.userId.email?.split("@")[0] || "",
            balance: order.userId.balance || 0,
          }
        : { _id: null, email: "Unknown", username: "", balance: 0 },
    }));

    res.json({ orders, totalPages });
  } catch (err) {
    console.error("CP GET ALL ORDERS ERROR:", err);
    res.status(500).json({ message: "Failed to fetch orders" });
  }
};

// ======================= COMPLETE ORDER =======================
// Child panel owner manually completes an order on their panel.
// Also credits their commission if not already credited.

export const completeCPOrder = async (req, res) => {
  try {
    const order = await Order.findOne({
      _id: req.params.id,
      childPanelOwner: req.user._id,
    }).populate("userId", "email balance");

    if (!order) return res.status(404).json({ message: "Order not found" });
    if (order.status === "completed")
      return res.status(400).json({ message: "Already completed" });

    order.status = "completed";
    order.quantityDelivered = order.quantity;
    await order.save();

    // Refund user wallet entry is not needed on complete —
    // charge was already deducted at order creation.
    // We only credit commission here.
    await creditChildPanelCommission(order);

    const io = req.app.get("io");
    if (io) {
      io.emit("order:update", formatOrder(order));
      io.emit("wallet:update", { userId: order.userId?._id });
    }

    res.json({ message: "Order completed", order: formatOrder(order) });
  } catch (err) {
    console.error("CP COMPLETE ORDER ERROR:", err);
    res.status(500).json({ message: "Failed to complete order" });
  }
};

// ======================= REFUND ORDER =======================
// Child panel owner refunds an order — credits the user back
// and reverses any child panel commission already credited.

export const refundCPOrder = async (req, res) => {
  try {
    const order = await Order.findOne({
      _id: req.params.id,
      childPanelOwner: req.user._id,
    }).populate("userId", "email balance");

    if (!order) return res.status(404).json({ message: "Order not found" });
    if (order.status === "refunded")
      return res.status(400).json({ message: "Already refunded" });

    order.status = "refunded";
    await order.save();

    // Credit the charge back to the user's wallet
    if (order.userId) {
      let wallet = await Wallet.findOne({ user: order.userId._id });
      if (!wallet)
        wallet = await Wallet.create({
          user: order.userId._id,
          transactions: [],
        });

      wallet.transactions.push({
        type: "Order Refund",
        amount: order.charge,
        status: "Completed",
        note: `Refund - Order #${order.customOrderId || order.orderId}`,
        createdAt: new Date(),
      });

      wallet.balance = calculateBalance(wallet.transactions);
      await wallet.save();

      await User.findByIdAndUpdate(order.userId._id, {
        balance: wallet.balance,
      });
    }

    // Reverse child panel commission if it was already credited
    await reverseChildPanelCommission(order);

    const io = req.app.get("io");
    if (io) {
      io.emit("order:update", formatOrder(order));
      io.emit("wallet:update", { userId: order.userId?._id });
    }

    res.json({ message: "Order refunded", order: formatOrder(order) });
  } catch (err) {
    console.error("CP REFUND ORDER ERROR:", err);
    res.status(500).json({ message: "Failed to refund order" });
  }
};

// ======================= WALLET STATS =======================
// Stats scoped to orders on this child panel only

export const getCPWalletStats = async (req, res) => {
  try {
    const ownerId = req.user._id;

    // Only wallets of users that belong to this child panel
    const cpUsers = await User.find({
      childPanelOwner: ownerId,
    }).select("_id");

    const cpUserIds = cpUsers.map((u) => u._id);

    const wallets = await Wallet.find({ user: { $in: cpUserIds } });

    let totalBalance = 0;
    let totalUsed = 0;

    wallets.forEach((wallet) => {
      const completed = wallet.transactions.filter(
        (t) => t.status === "Completed"
      );

      const moneyIn = completed
        .filter((t) => t.amount > 0)
        .reduce((acc, t) => acc + t.amount, 0);

      const moneyOut = completed
        .filter((t) => t.amount < 0)
        .reduce((acc, t) => acc + Math.abs(t.amount), 0);

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
