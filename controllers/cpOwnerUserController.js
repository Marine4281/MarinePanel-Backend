// controllers/cpOwnerUserController.js
//
// Child panel owner managing users within their panel.
// Every query is scoped to childPanelOwner: req.user._id
// so it is impossible to read or modify users from another panel.
// Mirrors adminUserController.js — same operations, different scope.

import User from "../models/User.js";
import Order from "../models/Order.js";
import Wallet from "../models/Wallet.js";
import formatLastSeen from "../utils/formatLastSeen.js";

// ======================= HELPERS =======================

const calculateBalance = (transactions = []) =>
  transactions
    .filter((t) => t.status === "Completed")
    .reduce((acc, t) => acc + (Number(t.amount) || 0), 0);

const normalizeCountryCode = (value) => {
  if (!value || typeof value !== "string") return "US";
  const map = { "united states": "US", usa: "US", us: "US", kenya: "KE" };
  const cleaned = value.trim().toLowerCase();
  return map[cleaned] || cleaned.toUpperCase();
};

// ======================= GET ALL USERS =======================
// Returns all non-reseller users that belong to this child panel

export const getCPUsers = async (req, res) => {
  try {
    const { search } = req.query;

    const query = {
      childPanelOwner: req.user._id,
      isReseller: false,
    };

    if (search) {
      query.$or = [
        { email: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
      ];
    }

    const usersRaw = await User.find(query).sort({ createdAt: -1 });

    const users = await Promise.all(
      usersRaw.map(async (user) => {
        let wallet = await Wallet.findOne({ user: user._id });
        let balance = 0;

        if (wallet) {
          const computed = calculateBalance(wallet.transactions);

          if (wallet.balance !== computed) {
            wallet.balance = computed;
            await wallet.save();
          }

          balance = computed;

          if (user.balance !== balance) {
            await User.findByIdAndUpdate(user._id, { balance });
          }
        }

        return {
          ...user.toObject(),
          countryCode: normalizeCountryCode(user.countryCode),
          balance,
          name: user.email.split("@")[0],
          lastSeen: formatLastSeen(user.lastSeen),
        };
      })
    );

    res.json(users);
  } catch (err) {
    console.error("CP GET ALL USERS ERROR:", err);
    res.status(500).json({ message: "Failed to fetch users" });
  }
};

// ======================= GET USER BY ID =======================
// Only returns the user if they belong to this child panel

export const getCPUserById = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    const user = await User.findOne({
      _id: req.params.id,
      childPanelOwner: req.user._id,
    }).select("-password");

    if (!user) return res.status(404).json({ message: "User not found" });

    const wallet = await Wallet.findOne({ user: user._id });
    const transactions = wallet?.transactions || [];
    const balance = calculateBalance(transactions);

    const skip = (Number(page) - 1) * Number(limit);

    const [orders, totalOrders] = await Promise.all([
      Order.find({ userId: user._id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .select("service link charge quantity status createdAt"),

      Order.countDocuments({ userId: user._id }),
    ]);

    res.json({
      user: {
        ...user.toObject(),
        countryCode: normalizeCountryCode(user.countryCode),
        balance,
        name: user.email.split("@")[0],
        lastSeen: formatLastSeen(user.lastSeen),
      },
      transactions: transactions.sort(
        (a, b) =>
          new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date)
      ),
      orders,
      pagination: {
        total: totalOrders,
        page: Number(page),
        pages: Math.ceil(totalOrders / Number(limit)),
      },
    });
  } catch (err) {
    console.error("CP GET USER BY ID ERROR:", err);
    res.status(500).json({ message: "Failed to fetch user" });
  }
};

// ======================= UPDATE USER BALANCE =======================

export const updateCPUserBalance = async (req, res) => {
  try {
    const newBalance = Number(req.body.balance);

    if (Number.isNaN(newBalance)) {
      return res.status(400).json({ message: "Invalid balance" });
    }

    // Scope check — user must belong to this child panel
    const user = await User.findOne({
      _id: req.params.id,
      childPanelOwner: req.user._id,
    });

    if (!user) return res.status(404).json({ message: "User not found" });

    let wallet = await Wallet.findOne({ user: user._id });

    if (!wallet) {
      wallet = await Wallet.create({
        user: user._id,
        transactions: [
          {
            type: "CP Admin Adjustment",
            amount: newBalance,
            status: "Completed",
            note: "Initial balance set by child panel admin",
            createdAt: new Date(),
          },
        ],
      });
    } else {
      const current = calculateBalance(wallet.transactions);
      const diff = newBalance - current;

      if (diff !== 0) {
        wallet.transactions.push({
          type: "CP Admin Adjustment",
          amount: diff,
          status: "Completed",
          note: "Balance updated by child panel admin",
          createdAt: new Date(),
        });
      }
    }

    wallet.balance = calculateBalance(wallet.transactions);
    await wallet.save();

    await User.findByIdAndUpdate(user._id, { balance: wallet.balance });

    res.json({
      user: {
        ...user.toObject(),
        countryCode: normalizeCountryCode(user.countryCode),
        balance: wallet.balance,
        name: user.email.split("@")[0],
        lastSeen: formatLastSeen(user.lastSeen),
      },
      wallet,
    });
  } catch (err) {
    console.error("CP UPDATE USER BALANCE ERROR:", err);
    res.status(500).json({ message: "Balance update failed" });
  }
};

// ======================= BLOCK =======================

export const blockCPUser = async (req, res) => {
  try {
    const user = await User.findOneAndUpdate(
      { _id: req.params.id, childPanelOwner: req.user._id },
      { isBlocked: true },
      { new: true }
    );

    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({
      ...user.toObject(),
      countryCode: normalizeCountryCode(user.countryCode),
      name: user.email.split("@")[0],
      lastSeen: formatLastSeen(user.lastSeen),
    });
  } catch (err) {
    console.error("CP BLOCK USER ERROR:", err);
    res.status(500).json({ message: "Block failed" });
  }
};

// ======================= UNBLOCK =======================

export const unblockCPUser = async (req, res) => {
  try {
    const user = await User.findOneAndUpdate(
      { _id: req.params.id, childPanelOwner: req.user._id },
      { isBlocked: false },
      { new: true }
    );

    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({
      ...user.toObject(),
      countryCode: normalizeCountryCode(user.countryCode),
      name: user.email.split("@")[0],
      lastSeen: formatLastSeen(user.lastSeen),
    });
  } catch (err) {
    console.error("CP UNBLOCK USER ERROR:", err);
    res.status(500).json({ message: "Unblock failed" });
  }
};

// ======================= FREEZE =======================

export const freezeCPUser = async (req, res) => {
  try {
    const user = await User.findOneAndUpdate(
      { _id: req.params.id, childPanelOwner: req.user._id },
      { isFrozen: true },
      { new: true }
    );

    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({
      ...user.toObject(),
      countryCode: normalizeCountryCode(user.countryCode),
      name: user.email.split("@")[0],
      lastSeen: formatLastSeen(user.lastSeen),
    });
  } catch (err) {
    console.error("CP FREEZE USER ERROR:", err);
    res.status(500).json({ message: "Freeze failed" });
  }
};

// ======================= UNFREEZE =======================

export const unfreezeCPUser = async (req, res) => {
  try {
    const user = await User.findOneAndUpdate(
      { _id: req.params.id, childPanelOwner: req.user._id },
      { isFrozen: false },
      { new: true }
    );

    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({
      ...user.toObject(),
      countryCode: normalizeCountryCode(user.countryCode),
      name: user.email.split("@")[0],
      lastSeen: formatLastSeen(user.lastSeen),
    });
  } catch (err) {
    console.error("CP UNFREEZE USER ERROR:", err);
    res.status(500).json({ message: "Unfreeze failed" });
  }
};

// ======================= DELETE =======================

export const deleteCPUser = async (req, res) => {
  try {
    const user = await User.findOne({
      _id: req.params.id,
      childPanelOwner: req.user._id,
    });

    if (!user) return res.status(404).json({ message: "User not found" });

    await User.findByIdAndDelete(user._id);
    await Order.deleteMany({ userId: user._id });
    await Wallet.deleteOne({ user: user._id });

    res.json({ message: "User deleted" });
  } catch (err) {
    console.error("CP DELETE USER ERROR:", err);
    res.status(500).json({ message: "Delete failed" });
  }
};

// ======================= USER ORDERS =======================

export const getCPUserOrders = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    // Verify user belongs to this child panel first
    const user = await User.findOne({
      _id: req.params.id,
      childPanelOwner: req.user._id,
    });

    if (!user) return res.status(404).json({ message: "User not found" });

    const skip = (Number(page) - 1) * Number(limit);

    const [orders, total] = await Promise.all([
      Order.find({ userId: user._id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),

      Order.countDocuments({ userId: user._id }),
    ]);

    res.json({
      orders,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
    });
  } catch (err) {
    console.error("CP GET USER ORDERS ERROR:", err);
    res.status(500).json({ message: "Failed to fetch orders" });
  }
};

// ======================= USER TRANSACTIONS =======================

export const getCPUserTransactions = async (req, res) => {
  try {
    // Verify user belongs to this child panel first
    const user = await User.findOne({
      _id: req.params.id,
      childPanelOwner: req.user._id,
    });

    if (!user) return res.status(404).json({ message: "User not found" });

    const wallet = await Wallet.findOne({ user: user._id });

    if (!wallet) {
      return res.status(404).json({ message: "Wallet not found" });
    }

    res.json(wallet.transactions || []);
  } catch (err) {
    console.error("CP GET USER TRANSACTIONS ERROR:", err);
    res.status(500).json({ message: "Failed to fetch transactions" });
  }
};
