// controllers/adminUserQueryController.js

import User from "../models/User.js";
import Order from "../models/Order.js";
import Wallet from "../models/Wallet.js";
import logAdminAction from "../utils/logAdminAction.js";
import formatLastSeen from "../utils/formatLastSeen.js";
import { calcBalance } from "../utils/gatewayHelpers.js"; // ✅ single source of truth
import { normalizeCountryCode, getUserTypes } from "../utils/adminUserHelpers.js";

// ======================= GET ALL USERS =======================
export const getAllUsers = async (req, res) => {
  try {
    const { search } = req.query;

    const baseFilter = {
      scope: "platform",
      childPanelOwner: { $in: [null, undefined] },
      isChildPanel: { $ne: true },
    };

    const query = search
      ? {
          ...baseFilter,
          $or: [
            { email: { $regex: search, $options: "i" } },
            { phone: { $regex: search, $options: "i" } },
          ],
        }
      : baseFilter;

    const usersRaw = await User.find(query).sort({ createdAt: -1 });

    const users = await Promise.all(
      usersRaw.map(async (user) => {
        let wallet = await Wallet.findOne({ user: user._id });
        let balance = 0;

        if (wallet) {
          const computed = calcBalance(wallet.transactions);
          if (wallet.balance !== computed) {
            wallet.balance = computed;
            await wallet.save();
          }
          balance = computed;
          if (user.balance !== balance) {
            await User.findByIdAndUpdate(user._id, { balance });
          }
        }

        const name = user.email.split("@")[0];

        return {
          ...user.toObject(),
          countryCode: normalizeCountryCode(user.countryCode),
          balance,
          name,
          lastSeen: formatLastSeen(user.lastSeen),
          userTypes: getUserTypes(user),
        };
      })
    );

    if (req.user) {
      await logAdminAction({
        adminId: req.user._id,
        adminEmail: req.user.email,
        action: "VIEW_USERS",
        description: "Admin fetched all users",
        ipAddress: req.ip,
      });
    }

    res.json(users);
  } catch (err) {
    console.error("GET ALL USERS ERROR:", err);
    res.status(500).json({ message: "Failed to fetch users" });
  }
};

// ======================= GET USER BY ID =======================
export const getUserById = async (req, res) => {
  try {
    const { page = 1, limit = 10, txPage = 1, txLimit = 10 } = req.query;

    const user = await User.findById(req.params.id)
      .select("-password")
      .populate("resellerOwner", "email brandName brandSlug")
      .populate("childPanelOwner", "email childPanelBrandName");

    if (!user) return res.status(404).json({ message: "User not found" });

    const wallet = await Wallet.findOne({ user: user._id });
    const allTransactions = (wallet?.transactions || []).sort(
      (a, b) =>
        new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date)
    );
    const balance = calcBalance(allTransactions);

    // Paginate orders
    const skip = (Number(page) - 1) * Number(limit);
    const [orders, totalOrders] = await Promise.all([
      Order.find({ userId: user._id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .select("service serviceLink charge quantity status createdAt"),
      Order.countDocuments({ userId: user._id }),
    ]);

    // Paginate transactions
    const txSkip = (Number(txPage) - 1) * Number(txLimit);
    const paginatedTransactions = allTransactions.slice(
      txSkip,
      txSkip + Number(txLimit)
    );
    const totalTransactions = allTransactions.length;

    if (req.user) {
      await logAdminAction({
        adminId: req.user._id,
        adminEmail: req.user.email,
        action: "VIEW_USER",
        description: `Viewed user ${user.email}`,
        targetType: "user",
        targetId: user._id,
        ipAddress: req.ip,
      });
    }

    res.json({
      user: {
        ...user.toObject(),
        countryCode: normalizeCountryCode(user.countryCode),
        balance,
        name: user.email.split("@")[0],
        lastSeen: formatLastSeen(user.lastSeen),
        userTypes: getUserTypes(user),
        totalOrders,
      },
      transactions: paginatedTransactions,
      transactionPagination: {
        total: totalTransactions,
        page: Number(txPage),
        pages: Math.ceil(totalTransactions / Number(txLimit)),
      },
      orders,
      pagination: {
        total: totalOrders,
        page: Number(page),
        pages: Math.ceil(totalOrders / Number(limit)),
      },
    });
  } catch (err) {
    console.error("GET USER BY ID ERROR:", err);
    res.status(500).json({ message: "Failed to fetch user" });
  }
};

// ======================= USER ORDERS =======================
export const getUserOrders = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const [orders, total] = await Promise.all([
      Order.find({ userId: req.params.id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Order.countDocuments({ userId: req.params.id }),
    ]);

    res.json({
      orders,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
      total,
    });
  } catch (err) {
    console.error("GET USER ORDERS ERROR:", err);
    res.status(500).json({ message: "Failed to fetch orders" });
  }
};

// ======================= TRANSACTIONS =======================
export const getUserTransactions = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const wallet = await Wallet.findOne({ user: req.params.id });

    if (!wallet) {
      return res.status(404).json({ message: "Wallet not found" });
    }

    const all = (wallet.transactions || []).sort(
      (a, b) =>
        new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date)
    );

    const skip = (Number(page) - 1) * Number(limit);
    const paginated = all.slice(skip, skip + Number(limit));

    res.json({
      transactions: paginated,
      total: all.length,
      page: Number(page),
      pages: Math.ceil(all.length / Number(limit)),
    });
  } catch (err) {
    console.error("GET USER TRANSACTIONS ERROR:", err);
    res.status(500).json({ message: "Failed to fetch transactions" });
  }
};
