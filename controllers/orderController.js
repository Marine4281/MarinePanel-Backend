import Order from "../models/Order.js";
import Wallet from "../models/Wallet.js";
import User from "../models/User.js";
import Settings from "../models/Settings.js";
import AdminService from "../models/Service.js";
import axios from "axios";
import { v4 as uuidv4 } from "uuid"; // ✅ for readable order IDs

// Helper to calculate balance
const calculateBalance = (transactions = []) =>
  transactions.reduce((acc, t) => acc + (t.amount || 0), 0);

// ================= CREATE ORDER =================
export const createOrder = async (req, res) => {
  try {
    const { category, service, link, quantity } = req.body;

    if (!category || !service || !link || !quantity) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found" });

    let wallet = await Wallet.findOne({ user: req.user._id });
    if (!wallet) {
      wallet = await Wallet.create({
        user: req.user._id,
        balance: 0,
        transactions: [],
      });
    }

    const serviceData = await AdminService.findOne({
      name: service,
      status: true,
    });
    if (!serviceData)
      return res.status(404).json({ message: "Service not found" });

    // ================= COMMISSION =================
    let settings = await Settings.findOne();
    if (!settings) {
      settings = await Settings.create({ commission: 50, totalRevenue: 0 });
    }

    const commissionPercent = settings.commission;

    const baseCharge = (quantity / 1000) * serviceData.rate;
    const finalCharge = baseCharge * (1 + commissionPercent / 100);

    const currentBalance =
      typeof wallet.balance === "number"
        ? wallet.balance
        : calculateBalance(wallet.transactions);

    if (currentBalance < finalCharge) {
      return res.status(400).json({ message: "Insufficient balance" });
    }

    // ================= SEND ORDER TO PROVIDER FIRST =================
    let providerOrderId;
    let providerResponseData;

    try {
      const providerResponse = await axios.post(
        serviceData.providerApiUrl,
        {
          key: serviceData.providerApiKey,
          action: "add",
          service: serviceData.providerServiceId,
          link,
          quantity,
        },
        { timeout: 15000 }
      );

      providerResponseData = providerResponse.data;

      if (!providerResponseData?.order) {
        return res
          .status(500)
          .json({ message: "Failed to create order with provider" });
      }

      providerOrderId = providerResponseData.order;
    } catch (providerError) {
      return res.status(500).json({
        message:
          providerError.response?.data || "Order failed to reach provider",
      });
    }

    // ================= CREATE ORDER IN DB =================
    const order = await Order.create({
      orderId: "ORD-" + uuidv4().slice(0, 8), // ✅ human-readable Order ID
      userId: req.user._id,
      category,
      service,
      link,
      quantity,
      charge: finalCharge,
      status: "pending",
      provider: serviceData.provider,
      providerApiUrl: serviceData.providerApiUrl,
      providerServiceId: serviceData.providerServiceId,
      providerOrderId, // ✅ Required field now included
      providerStatus: "processing",
      providerResponse: providerResponseData,
    });

    // ================= WALLET DEDUCTION =================
    const transaction = {
      type: "Order",
      amount: -Number(finalCharge),
      status: "Completed",
      note: `Order #${order._id}`,
      date: new Date(),
    };

    wallet.transactions.push(transaction);
    wallet.balance = calculateBalance(wallet.transactions);
    await wallet.save();

    // Sync User.balance
    await User.findByIdAndUpdate(req.user._id, { balance: wallet.balance });

    // ================= REVENUE =================
    const commissionAmount = finalCharge - baseCharge;
    settings.totalRevenue += commissionAmount;
    await settings.save();

    // 🔔 Emit Socket.IO update
    const io = req.app.get("io");
    if (io) {
      io.emit("wallet:update", {
        userId: req.user._id.toString(),
        balance: wallet.balance,
        transactions: wallet.transactions,
      });
    }

    res.status(201).json({
      order,
      balance: wallet.balance,
      transaction,
    });
  } catch (error) {
    console.error("Create Order Error:", error);
    res.status(500).json({ message: "Order failed" });
  }
};

// ================= GET USER ORDERS =================
export const getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .populate("userId", "email balance"); // ✅ populate user info

    const wallet = await Wallet.findOne({ user: req.user._id });

    const transactionsMap =
      wallet?.transactions.reduce((acc, t) => {
        if (t.note?.includes("#")) {
          const orderId = t.note.split("#")[1];
          acc[orderId] = t;
        }
        return acc;
      }, {}) || {};

    const ordersWithTransactions = orders.map((order) => {
      const transaction = transactionsMap[order._id] || null;
      return {
        ...order.toObject(),
        transaction: transaction
          ? {
              date: transaction.date,
              type: transaction.type,
              amount: transaction.amount,
              status: transaction.status,
              note: transaction.note,
            }
          : null,
        user: {
          name: order.userId?.email?.split("@")[0] || "N/A",
          email: order.userId?.email,
          balance: order.userId?.balance || 0,
        },
      };
    });

    res.json(ordersWithTransactions);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to fetch orders" });
  }
};

// ================= PREVIEW ORDER =================
export const previewOrder = async (req, res) => {
  try {
    const { service, quantity } = req.body;

    if (!service || !quantity) {
      return res
        .status(400)
        .json({ message: "Service and quantity are required" });
    }

    const serviceData = await AdminService.findOne({
      name: service,
      status: true,
    });
    if (!serviceData)
      return res.status(404).json({ message: "Service not found" });

    let settings = await Settings.findOne();
    if (!settings) {
      settings = await Settings.create({ commission: 50, totalRevenue: 0 });
    }

    const commissionPercent = settings.commission;

    const baseCharge = (quantity / 1000) * serviceData.rate;
    const finalCharge = baseCharge * (1 + commissionPercent / 100);

    res.json({
      service,
      quantity,
      baseCharge: baseCharge.toFixed(4),
      commissionPercent,
      finalCharge: finalCharge.toFixed(4),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to calculate charge" });
  }
};
