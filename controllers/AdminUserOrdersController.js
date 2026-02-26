import Order from "../models/Order.js";
import User from "../models/User.js";
import Wallet from "../models/Wallet.js";

/* ======================================================
   GET ALL USER ORDERS (Search + Pagination)
====================================================== */
export const getUserOrders = async (req, res) => {
  try {
    const { search = "", page = 1, limit = 10 } = req.query;

    const pageNum = Number(page);
    const limitNum = Number(limit);

    let query = {};

    if (search) {
      const users = await User.find({
        email: { $regex: search, $options: "i" },
      }).select("_id");

      const userIds = users.map((u) => u._id);

      query = {
        $or: [
          { orderId: { $regex: search, $options: "i" } },
          { userId: { $in: userIds } },
        ],
      };
    }

    const total = await Order.countDocuments(query);

    const orders = await Order.find(query)
      .populate("userId", "email balance")
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum);

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

    // 🚫 Cannot modify refunded
    if (order.status === "refunded") {
      return res.status(400).json({
        message: "Cannot modify a refunded order",
      });
    }

    // 🚫 Prevent completed → other states
    if (order.status === "completed" && status !== "completed") {
      return res.status(400).json({
        message: "Completed order cannot be modified",
      });
    }

    order.status = status;

    // Auto adjust progress if completed
    if (status === "completed") {
      order.quantityDelivered = order.quantity;
    }

    await order.save();

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

    // 🚫 Lock refunded
    if (order.status === "refunded") {
      return res.status(400).json({
        message: "Cannot edit refunded order",
      });
    }

    // 🚫 Lock completed
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

    // 🚫 Cannot exceed total quantity
    if (delivered > order.quantity) {
      return res.status(400).json({
        message: "Delivered cannot exceed total quantity",
      });
    }

    // 🚫 Prevent reducing already delivered
    if (delivered < order.quantityDelivered) {
      return res.status(400).json({
        message: "Cannot reduce delivered quantity",
      });
    }

    order.quantityDelivered = delivered;

    // Auto complete if fully delivered
    if (delivered === order.quantity) {
      order.status = "completed";
    } else if (delivered > 0) {
      order.status = "processing";
    }

    await order.save();

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
   REFUND ORDER (FULLY PROTECTED)
====================================================== */
export const refundOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate("userId");

    if (!order)
      return res.status(404).json({ message: "Order not found" });

    // 🚫 Prevent double refund
    if (order.status === "refunded") {
      return res.status(400).json({
        message: "Order already refunded",
      });
    }

    // 🚫 Prevent refund if completed
    if (order.status === "completed") {
      return res.status(400).json({
        message: "Cannot refund completed order",
      });
    }

    // 🚫 Prevent refund if already partially delivered
    if (order.quantityDelivered > 0) {
      return res.status(400).json({
        message: "Cannot refund order with delivered quantity",
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

    // 💰 Add refund transaction
    wallet.transactions.push({
      type: "Refund",
      amount: order.charge,
      status: "Completed",
      note: `Refund for Order ${order.orderId}`,
    });

    wallet.balance += order.charge;

    await wallet.save();

    order.status = "refunded";
    await order.save();

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

    res.json({ message: "Refund successful" });
  } catch (error) {
    console.error("Refund Error:", error);
    res.status(500).json({ message: "Refund failed" });
  }
};
