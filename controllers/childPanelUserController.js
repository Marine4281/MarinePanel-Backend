// controllers/childPanelUserController.js

import User from "../models/User.js";
import Order from "../models/Order.js";
import Wallet from "../models/Wallet.js";
import AdminLog from "../models/AdminLog.js";

const calculateBalance = (transactions = []) =>
  transactions
    .filter((t) => t.status === "Completed")
    .reduce((acc, t) => acc + (Number(t.amount) || 0), 0);

const log = async (cpUser, action, description, targetId, ip) => {
  try {
    await AdminLog.create({
      admin: cpUser._id,
      adminEmail: cpUser.email,
      action,
      description,
      targetType: "user",
      targetId,
      ipAddress: ip,
    });
  } catch {}
};

// ── GET USERS (paginated, searchable) ─────────────────────────
export const getCPUsers = async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      User.find({ childPanelOwner: req.user._id, isReseller: false })
        .select("-password")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      User.countDocuments({ childPanelOwner: req.user._id, isReseller: false }),
    ]);

    res.json({
      success: true,
      data: users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch users" });
  }
};


// ── GET SINGLE USER DETAIL ─────────────────────────────────────
export const getCPUserById = async (req, res) => {
  try {
    const cpId = req.user._id;
    const { txPage = 1, txLimit = 10, orderPage = 1, orderLimit = 10 } = req.query;

    const user = await User.findOne({
      _id: req.params.id,
      childPanelOwner: cpId,
    }).select("-password");

    if (!user) return res.status(404).json({ message: "User not found" });

    const wallet = await Wallet.findOne({ user: user._id });
    const allTx = (wallet?.transactions || []).sort(
      (a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date)
    );
    const balance = calculateBalance(allTx);

    const txSkip = (Number(txPage) - 1) * Number(txLimit);
    const paginatedTx = allTx.slice(txSkip, txSkip + Number(txLimit));

    const oSkip = (Number(orderPage) - 1) * Number(orderLimit);
    const [orders, totalOrders] = await Promise.all([
      Order.find({ userId: user._id })
        .sort({ createdAt: -1 })
        .skip(oSkip)
        .limit(Number(orderLimit))
        .select("service serviceLink charge quantity status createdAt"),
      Order.countDocuments({ userId: user._id }),
    ]);

    await log(req.user, "CP_VIEW_USER", `Viewed user ${user.email}`, user._id, req.ip);

    res.json({
      user: { ...user.toObject(), balance, totalOrders },
      transactions: paginatedTx,
      transactionPagination: {
        total: allTx.length,
        page: Number(txPage),
        pages: Math.ceil(allTx.length / Number(txLimit)),
      },
      orders,
      orderPagination: {
        total: totalOrders,
        page: Number(orderPage),
        pages: Math.ceil(totalOrders / Number(orderLimit)),
      },
    });
  } catch (err) {
    console.error("getCPUserById:", err);
    res.status(500).json({ message: "Failed to fetch user" });
  }
};

// ── BLOCK ──────────────────────────────────────────────────────
export const cpBlockUser = async (req, res) => {
  try {
    const user = await User.findOneAndUpdate(
      { _id: req.params.id, childPanelOwner: req.user._id },
      { isBlocked: true },
      { new: true }
    );
    if (!user) return res.status(404).json({ message: "User not found" });
    await log(req.user, "CP_BLOCK_USER", `Blocked ${user.email}`, user._id, req.ip);
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: "Block failed" });
  }
};

// ── UNBLOCK ────────────────────────────────────────────────────
export const cpUnblockUser = async (req, res) => {
  try {
    const user = await User.findOneAndUpdate(
      { _id: req.params.id, childPanelOwner: req.user._id },
      { isBlocked: false },
      { new: true }
    );
    if (!user) return res.status(404).json({ message: "User not found" });
    await log(req.user, "CP_UNBLOCK_USER", `Unblocked ${user.email}`, user._id, req.ip);
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: "Unblock failed" });
  }
};

// ── FREEZE ─────────────────────────────────────────────────────
export const cpFreezeUser = async (req, res) => {
  try {
    const user = await User.findOneAndUpdate(
      { _id: req.params.id, childPanelOwner: req.user._id },
      { isFrozen: true },
      { new: true }
    );
    if (!user) return res.status(404).json({ message: "User not found" });
    await log(req.user, "CP_FREEZE_USER", `Froze ${user.email}`, user._id, req.ip);
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: "Freeze failed" });
  }
};

// ── UNFREEZE ───────────────────────────────────────────────────
export const cpUnfreezeUser = async (req, res) => {
  try {
    const user = await User.findOneAndUpdate(
      { _id: req.params.id, childPanelOwner: req.user._id },
      { isFrozen: false },
      { new: true }
    );
    if (!user) return res.status(404).json({ message: "User not found" });
    await log(req.user, "CP_UNFREEZE_USER", `Unfroze ${user.email}`, user._id, req.ip);
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: "Unfreeze failed" });
  }
};

// ── DELETE ─────────────────────────────────────────────────────
export const cpDeleteUser = async (req, res) => {
  try {
    const user = await User.findOne({
      _id: req.params.id,
      childPanelOwner: req.user._id,
    });
    if (!user) return res.status(404).json({ message: "User not found" });

    await Promise.all([
      User.findByIdAndDelete(user._id),
      Order.deleteMany({ userId: user._id }),
      Wallet.deleteOne({ user: user._id }),
    ]);

    await log(req.user, "CP_DELETE_USER", `Deleted ${user.email}`, user._id, req.ip);
    res.json({ message: "User deleted" });
  } catch (err) {
    res.status(500).json({ message: "Delete failed" });
  }
};

// ── UPDATE BALANCE ─────────────────────────────────────────────
export const cpUpdateUserBalance = async (req, res) => {
  try {
    const newBalance = Number(req.body.balance);
    if (isNaN(newBalance)) return res.status(400).json({ message: "Invalid balance" });

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
            type: "CP Adjustment",
            amount: newBalance,
            status: "Completed",
            note: "Balance set by child panel owner",
            createdAt: new Date(),
          },
        ],
      });
    } else {
      const current = calculateBalance(wallet.transactions);
      const diff = newBalance - current;
      if (diff !== 0) {
        wallet.transactions.push({
          type: "CP Adjustment",
          amount: diff,
          status: "Completed",
          note: "Balance updated by child panel owner",
          createdAt: new Date(),
        });
      }
    }

    wallet.balance = calculateBalance(wallet.transactions);
    await wallet.save();
    await User.findByIdAndUpdate(user._id, { balance: wallet.balance });

    await log(req.user, "CP_UPDATE_BALANCE", `Updated balance for ${user.email} to ${wallet.balance}`, user._id, req.ip);
    res.json({ balance: wallet.balance });
  } catch (err) {
    res.status(500).json({ message: "Balance update failed" });
  }
};

// ── UPDATE COMMISSION OVERRIDE ─────────────────────────────────
export const cpUpdateUserCommission = async (req, res) => {
  try {
    const { commissionOverride } = req.body;
    const isEmpty = commissionOverride === null || commissionOverride === "";
    const rate = isEmpty ? null : Number(commissionOverride);

    if (!isEmpty && (isNaN(rate) || rate < 0 || rate > 100)) {
      return res.status(400).json({ message: "Commission must be 0–100 or blank" });
    }

    const user = await User.findOne({
      _id: req.params.id,
      childPanelOwner: req.user._id,
    });
    if (!user) return res.status(404).json({ message: "User not found" });

    user.commissionOverride = rate;
    await user.save();

    await log(
      req.user,
      "CP_UPDATE_COMMISSION",
      isEmpty
        ? `Cleared commission override for ${user.email}`
        : `Set commission override for ${user.email} to ${rate}%`,
      user._id,
      req.ip
    );

    res.json({ commissionOverride: rate });
  } catch (err) {
    res.status(500).json({ message: "Commission update failed" });
  }
};

// ── GET PAGINATED TRANSACTIONS ─────────────────────────────────
export const cpGetUserTransactions = async (req, res) => {
  try {
    const user = await User.findOne({
      _id: req.params.id,
      childPanelOwner: req.user._id,
    });
    if (!user) return res.status(404).json({ message: "User not found" });

    const { page = 1, limit = 10 } = req.query;
    const wallet = await Wallet.findOne({ user: user._id });
    const all = (wallet?.transactions || []).sort(
      (a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date)
    );
    const skip = (Number(page) - 1) * Number(limit);
    res.json({
      transactions: all.slice(skip, skip + Number(limit)),
      total: all.length,
      page: Number(page),
      pages: Math.ceil(all.length / Number(limit)),
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch transactions" });
  }
};

// ── GET PAGINATED ORDERS ───────────────────────────────────────
export const cpGetUserOrders = async (req, res) => {
  try {
    const user = await User.findOne({
      _id: req.params.id,
      childPanelOwner: req.user._id,
    });
    if (!user) return res.status(404).json({ message: "User not found" });

    const { page = 1, limit = 10 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const [orders, total] = await Promise.all([
      Order.find({ userId: user._id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Order.countDocuments({ userId: user._id }),
    ]);

    res.json({ orders, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch orders" });
  }
};
