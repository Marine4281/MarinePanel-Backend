// controllers/cpOwnerUserController.js
//
// Child panel owner managing users within their panel.
// Every query is scoped to childPanelOwner: req.user._id
// so it is impossible to read or modify users from another panel.

import User from "../models/User.js";
import Order from "../models/Order.js";
import Wallet from "../models/Wallet.js";
import formatLastSeen from "../utils/formatLastSeen.js";
import logCpAdminAction from "../utils/logCpAdminAction.js";

// ======================= HELPERS =======================

const calculateBalance = (transactions = []) =>
  transactions
    .filter((t) => t.status === "Completed")
    .reduce((acc, t) => acc + (Number(t.amount) || 0), 0);

const normalizeCountryCode = (value) => {
  if (!value || typeof value !== "string") return null;
  const map = { "united states": "US", usa: "US", us: "US", kenya: "KE" };
  const cleaned = value.trim().toLowerCase();
  return map[cleaned] || cleaned.toUpperCase();
};

const getUserTypes = (user) => {
  const types = [];
  if (user.isReseller)       types.push("Reseller");
  if (user.apiAccessEnabled) types.push("API");
  if (types.length === 0)    types.push("User");
  return types;
};

// ======================= GET ALL USERS =======================

export const getCPUsers = async (req, res) => {
  try {
    const { search = "", page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    // Scope: all users belonging to this child panel (including resellers)
    const query = { childPanelOwner: req.user._id };

    if (search && search.trim()) {
      query.$or = [
        { email: { $regex: search.trim(), $options: "i" } },
        { phone: { $regex: search.trim(), $options: "i" } },
      ];
    }

    const [usersRaw, total] = await Promise.all([
      User.find(query)
        .select("-password")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      User.countDocuments(query),
    ]);

    const users = usersRaw.map((user) => ({
      ...user,
      countryCode: normalizeCountryCode(user.countryCode),
      name: user.email.split("@")[0],
      lastSeen: formatLastSeen(user.lastSeen),
      userTypes: getUserTypes(user),
    }));

    res.json({
      data: users,
      pagination: {
        page:  Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (err) {
    console.error("CP GET ALL USERS ERROR:", err);
    res.status(500).json({ message: "Failed to fetch users" });
  }
};

// ======================= GET USER BY ID =======================

export const getCPUserById = async (req, res) => {
  try {
    const { txPage = 1, txLimit = 10, page = 1, limit = 10 } = req.query;

    const user = await User.findOne({
      _id: req.params.id,
      childPanelOwner: req.user._id,
    }).select("-password");

    if (!user) return res.status(404).json({ message: "User not found" });

    const wallet = await Wallet.findOne({ user: user._id });
    const allTx = (wallet?.transactions || []).sort(
      (a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date)
    );
    const balance = calculateBalance(allTx);

    // Paginate transactions
    const txSkip = (Number(txPage) - 1) * Number(txLimit);
    const paginatedTx = allTx.slice(txSkip, txSkip + Number(txLimit));

    // Paginate orders
    const oSkip = (Number(page) - 1) * Number(limit);
    const [orders, totalOrders] = await Promise.all([
      Order.find({ userId: user._id })
        .sort({ createdAt: -1 })
        .skip(oSkip)
        .limit(Number(limit))
        .select("service link serviceLink charge quantity status createdAt"),
      Order.countDocuments({ userId: user._id }),
    ]);

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
      transactions: paginatedTx,
      transactionPagination: {
        total: allTx.length,
        page:  Number(txPage),
        pages: Math.ceil(allTx.length / Number(txLimit)),
      },
      orders,
      orderPagination: {
        total: totalOrders,
        page:  Number(page),
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
    if (Number.isNaN(newBalance))
      return res.status(400).json({ message: "Invalid balance" });

    const user = await User.findOne({
      _id: req.params.id,
      childPanelOwner: req.user._id,
    });
    if (!user) return res.status(404).json({ message: "User not found" });

    let wallet = await Wallet.findOne({ user: user._id });

    if (!wallet) {
      wallet = await Wallet.create({
        user: user._id,
        transactions: [{
          type: "CP Admin Adjustment",
          amount: newBalance,
          status: "Completed",
          note: "Initial balance set by child panel admin",
          createdAt: new Date(),
        }],
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
    logCpAdminAction({ adminId: req.user._id, adminEmail: req.user.email,childPanelId: req.user._id, action: "UPDATE_BALANCE", targetType: "User", targetId: user._id, description: `Updated balance for ${user.email}`, ipAddress: req.ip }).catch(() => {});

    res.json({ balance: wallet.balance });
  } catch (err) {
    console.error("CP UPDATE USER BALANCE ERROR:", err);
    res.status(500).json({ message: "Balance update failed" });
  }
};

// ======================= UPDATE COMMISSION =======================

export const updateCPUserCommission = async (req, res) => {
  try {
    const { commissionOverride } = req.body;
    const isEmpty = commissionOverride === null || commissionOverride === "";
    const rate = isEmpty ? null : Number(commissionOverride);

    if (!isEmpty && (isNaN(rate) || rate < 0 || rate > 100))
      return res.status(400).json({ message: "Commission must be 0–100 or blank" });

    const user = await User.findOne({
      _id: req.params.id,
      childPanelOwner: req.user._id,
    });
    if (!user) return res.status(404).json({ message: "User not found" });

    user.commissionOverride = rate;
    await user.save();
    logCpAdminAction({ adminId: req.user._id, adminEmail: req.user.email,childPanelId: req.user._id, action: "UPDATE_USER_COMMISSION", targetType: "User", targetId: user._id, description: `Updated commission for ${user.email}`, ipAddress: req.ip }).catch(() => {});

    res.json({ commissionOverride: rate });
  } catch (err) {
    console.error("CP UPDATE COMMISSION ERROR:", err);
    res.status(500).json({ message: "Commission update failed" });
  }
};

// ======================= PROMOTE TO ADMIN =======================


export const promoteCPUser = async (req, res) => {
  try {
    const user = await User.findOneAndUpdate(
      { _id: req.params.id, childPanelOwner: req.user._id },
      { isCpAdmin: true },
      { new: true }
    );
    if (!user) return res.status(404).json({ message: "User not found" });
    logCpAdminAction({ adminId: req.user._id, adminEmail: req.user.email, childPanelId: req.user._id, action: "PROMOTE_ADMIN", targetType: "User", targetId: user._id, description: `Promoted ${user.email} to CP admin`, ipAddress: req.ip }).catch(() => {});
    res.json({
      ...user.toObject(),
      countryCode: normalizeCountryCode(user.countryCode),
      name: user.email.split("@")[0],
      lastSeen: formatLastSeen(user.lastSeen),
      userTypes: getUserTypes(user),
    });
  } catch (err) {
    console.error("CP PROMOTE USER ERROR:", err);
    res.status(500).json({ message: "Promote failed" });
  }
};

export const demoteCPUser = async (req, res) => {
  try {
    const user = await User.findOneAndUpdate(
      { _id: req.params.id, childPanelOwner: req.user._id },
      { isCpAdmin: false },
      { new: true }
    );
    if (!user) return res.status(404).json({ message: "User not found" });
    logCpAdminAction({ adminId: req.user._id, adminEmail: req.user.email, childPanelId: req.user._id, action: "DEMOTE_ADMIN", targetType: "User", targetId: user._id, description: `Demoted ${user.email} from CP admin`, ipAddress: req.ip }).catch(() => {});
    res.json({
      ...user.toObject(),
      countryCode: normalizeCountryCode(user.countryCode),
      name: user.email.split("@")[0],
      lastSeen: formatLastSeen(user.lastSeen),
      userTypes: getUserTypes(user),
    });
  } catch (err) {
    console.error("CP DEMOTE USER ERROR:", err);
    res.status(500).json({ message: "Demote failed" });
  }
};
// ======================= DEMOTE FROM ADMIN =======================

export const demoteCPUser = async (req, res) => {
  try {
    const user = await User.findOneAndUpdate(
      { _id: req.params.id, childPanelOwner: req.user._id },
      { isAdmin: false },
      { new: true }
    );
    if (!user) return res.status(404).json({ message: "User not found" });
    logAdminAction({ adminId: req.user._id, adminEmail: req.user.email, action: "DEMOTE_ADMIN", targetType: "User", targetId: user._id, description: `Demoted ${user.email} from admin`, ipAddress: req.ip }).catch(() => {});
    res.json({
      ...user.toObject(),
      countryCode: normalizeCountryCode(user.countryCode),
      name: user.email.split("@")[0],
      lastSeen: formatLastSeen(user.lastSeen),
      userTypes: getUserTypes(user),
    });
  } catch (err) {
    console.error("CP DEMOTE USER ERROR:", err);
    res.status(500).json({ message: "Demote failed" });
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
    logCpAdminAction({ adminId: req.user._id, adminEmail: req.user.email, childPanelId: req.user._id,action: "BLOCK_USER", targetType: "User", targetId: user._id, description: `Blocked ${user.email}`, ipAddress: req.ip }).catch(() => {});
    res.json({
      ...user.toObject(),
      countryCode: normalizeCountryCode(user.countryCode),
      name: user.email.split("@")[0],
      lastSeen: formatLastSeen(user.lastSeen),
      userTypes: getUserTypes(user),
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
    logCpAdminAction({ adminId: req.user._id, adminEmail: req.user.email,childPanelId: req.user._id, action: "UNBLOCK_USER", targetType: "User", targetId: user._id, description: `Unblocked ${user.email}`, ipAddress: req.ip }).catch(() => {});
    res.json({
      ...user.toObject(),
      countryCode: normalizeCountryCode(user.countryCode),
      name: user.email.split("@")[0],
      lastSeen: formatLastSeen(user.lastSeen),
      userTypes: getUserTypes(user),
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
    logCpAdminAction({ adminId: req.user._id, adminEmail: req.user.email, childPanelId: req.user._id,action: "FREEZE_USER", targetType: "User", targetId: user._id, description: `Froze ${user.email}`, ipAddress: req.ip }).catch(() => {});
    res.json({
      ...user.toObject(),
      countryCode: normalizeCountryCode(user.countryCode),
      name: user.email.split("@")[0],
      lastSeen: formatLastSeen(user.lastSeen),
      userTypes: getUserTypes(user),
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
    logCpAdminAction({ adminId: req.user._id, adminEmail: req.user.email, childPanelId: req.user._id,action: "UNFREEZE_USER", targetType: "User", targetId: user._id, description: `Unfroze ${user.email}`, ipAddress: req.ip }).catch(() => {});
    res.json({
      ...user.toObject(),
      countryCode: normalizeCountryCode(user.countryCode),
      name: user.email.split("@")[0],
      lastSeen: formatLastSeen(user.lastSeen),
      userTypes: getUserTypes(user),
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

    await Promise.all([
      User.findByIdAndDelete(user._id),
      Order.deleteMany({ userId: user._id }),
      Wallet.deleteOne({ user: user._id }),
    ]);
    logCpAdminAction({ adminId: req.user._id, adminEmail: req.user.email, childPanelId: req.user._id,action: "DELETE_USER", targetType: "User", targetId: userId, description: `Deleted user ${userId}`, ipAddress: req.ip }).catch(() => {});

    res.json({ message: "User deleted" });
  } catch (err) {
    console.error("CP DELETE USER ERROR:", err);
    res.status(500).json({ message: "Delete failed" });
  }
};

// ======================= USER ORDERS =======================

export const getCPUserOrders = async (req, res) => {
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

    res.json({
      orders,
      total,
      page:  Number(page),
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
      page:  Number(page),
      pages: Math.ceil(all.length / Number(limit)),
    });
  } catch (err) {
    console.error("CP GET USER TRANSACTIONS ERROR:", err);
    res.status(500).json({ message: "Failed to fetch transactions" });
  }
};
