import mongoose from "mongoose";
import Order from "../models/Order.js";
import Wallet from "../models/Wallet.js";
import User from "../models/User.js";

// Helper: Calculate completed balance from transactions
const calculateBalance = (transactions = []) =>
  transactions
    .filter((t) => t.status === "Completed")
    .reduce((acc, t) => acc + (Number(t.amount) || 0), 0);

// Helper: Format order for frontend
const formatOrder = (order) => ({
  _id: order._id,
  orderId: order.orderId,
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
    : {
        _id: null,
        email: "Unknown",
        username: "",
        balance: 0,
      },
});

// ----------------------
// GET /api/admin/orders
export const getAllOrders = async (req, res) => {
  try {
    const { search = "", page = 1, limit = 10 } = req.query;

    const pageNum = Number(page);
    const limitNum = Number(limit);

    let orderQuery = {};

    if (search) {
      const users = await User.find({
        email: { $regex: search, $options: "i" },
      }).select("_id");

      const userIds = users.map((u) => u._id);

      const orQueries = [{ userId: { $in: userIds } }];

      if (mongoose.Types.ObjectId.isValid(search))
        orQueries.push({ _id: search });

      orQueries.push({ orderId: { $regex: search, $options: "i" } });

      orderQuery = { $or: orQueries };
    }

    const totalOrders = await Order.countDocuments(orderQuery);
    const totalPages = Math.ceil(totalOrders / limitNum);

    const ordersRaw = await Order.find(orderQuery)
      .populate("userId", "email balance")
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum);

    const orders = ordersRaw.map(formatOrder);

    res.json({ orders, totalPages });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch orders" });
  }
};

// ----------------------
// POST /api/admin/orders/:id/complete
export const completeOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate(
      "userId",
      "email balance"
    );

    if (!order) return res.status(404).json({ message: "Order not found" });
    if (order.status === "completed")
      return res.status(400).json({ message: "Already completed" });

    order.status = "completed";
    order.quantityDelivered = order.quantity;

    await order.save();

    if (order.userId) {
      let wallet = await Wallet.findOne({ user: order.userId._id });
      if (!wallet)
        wallet = await Wallet.create({
          user: order.userId._id,
          transactions: [],
        });

      wallet.transactions.push({
        type: "Order Completed",
        amount: -order.charge,
        status: "Completed",
        note: `Order #${order.orderId}`,
      });

      wallet.balance = calculateBalance(wallet.transactions);
      await wallet.save();

      await User.findByIdAndUpdate(order.userId._id, {
        balance: wallet.balance,
      });
    }

    const io = req.app.get("io");
    if (io) {
      io.emit("order:update", formatOrder(order));
      io.emit("wallet:update", {
        userId: order.userId?._id,
      });
    }

    res.json({ message: "Order completed", order: formatOrder(order) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to complete order" });
  }
};

// ----------------------
// POST /api/admin/orders/:id/refund
export const refundOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate(
      "userId",
      "email balance"
    );

    if (!order) return res.status(404).json({ message: "Order not found" });
    if (order.status === "refunded")
      return res.status(400).json({ message: "Already refunded" });

    order.status = "refunded";

    await order.save();

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
        note: `Order #${order.orderId}`,
      });

      wallet.balance = calculateBalance(wallet.transactions);
      await wallet.save();

      await User.findByIdAndUpdate(order.userId._id, {
        balance: wallet.balance,
      });
    }

    const io = req.app.get("io");
    if (io) {
      io.emit("order:update", formatOrder(order));
      io.emit("wallet:update", {
        userId: order.userId?._id,
      });
    }

    res.json({ message: "Order refunded", order: formatOrder(order) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to refund order" });
  }
};

// ----------------------
// GET /api/admin/wallets/stats
export const getWalletStats = async (req, res) => {
  try {
    const balanceData = await Wallet.aggregate([
      { $unwind: "$transactions" },
      { $match: { "transactions.status": "Completed" } },
      { $group: { _id: null, balance: { $sum: "$transactions.amount" } } },
    ]);

    const totalUsedData = await Order.aggregate([
      { $match: { status: "completed" } },
      { $group: { _id: null, totalUsed: { $sum: "$charge" } } },
    ]);

    res.json({
      balance: balanceData[0]?.balance || 0,
      totalUsed: totalUsedData[0]?.totalUsed || 0,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch wallet stats" });
  }
};
