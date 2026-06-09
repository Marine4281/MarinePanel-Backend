// controllers/adminUserController.js

import User from "../models/User.js";
import Order from "../models/Order.js";
import Wallet from "../models/Wallet.js";
import logAdminAction from "../utils/logAdminAction.js";
import formatLastSeen from "../utils/formatLastSeen.js";

// ======================= HELPERS =======================

const calculateBalance = (transactions = []) =>
  transactions
    .filter((t) => t.status === "Completed")
    .reduce((acc, t) => acc + (Number(t.amount) || 0), 0)
    .toFixed(4);

const normalizeCountryCode = (value) => {
  if (!value || typeof value !== "string") return "US";
  const map = {
    "united states": "US",
    usa: "US",
    us: "US",
    kenya: "KE",
  };
  const cleaned = value.trim().toLowerCase();
  return map[cleaned] || cleaned.toUpperCase();
};

// Derive user type tags from user document
const getUserTypes = (user) => {
  const types = [];
  if (user.isChildPanel) types.push("Child Panel");
  if (user.isReseller) types.push("Reseller");
  if (user.apiAccessEnabled) types.push("API");
  if (types.length === 0) types.push("User");
  return types;
};

// ======================= GET ALL USERS =======================
export const getAllUsers = async (req, res) => {
  try {
    const { search } = req.query;

    const baseFilter = {
  scope: "platform",
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
    const balance = calculateBalance(allTransactions);

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

// ======================= UPDATE USER BALANCE =======================
export const updateUserBalance = async (req, res) => {
  try {
    const newBalance = Number(req.body.balance);
    if (Number.isNaN(newBalance)) {
      return res.status(400).json({ message: "Invalid balance" });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    let wallet = await Wallet.findOne({ user: user._id });

    if (!wallet) {
      wallet = await Wallet.create({
        user: user._id,
        transactions: [
          {
            type: "Admin Adjustment",
            amount: newBalance,
            status: "Completed",
            note: "Initial balance set by admin",
            createdAt: new Date(),
          },
        ],
      });
    } else {
      const current = calculateBalance(wallet.transactions);
      const diff = newBalance - current;
      if (diff !== 0) {
        wallet.transactions.push({
          type: "Admin Adjustment",
          amount: diff,
          status: "Completed",
          note: "Balance updated by admin",
          createdAt: new Date(),
        });
      }
    }

    wallet.balance = calculateBalance(wallet.transactions);
    await wallet.save();
    await User.findByIdAndUpdate(user._id, { balance: wallet.balance });

    if (req.user) {
      await logAdminAction({
        adminId: req.user._id,
        adminEmail: req.user.email,
        action: "UPDATE_BALANCE",
        description: `Updated balance for ${user.email} to ${wallet.balance}`,
        targetType: "user",
        targetId: user._id,
        ipAddress: req.ip,
      });
    }

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
    console.error("UPDATE USER BALANCE ERROR:", err);
    res.status(500).json({ message: "Balance update failed" });
  }
};

// ======================= UPDATE USER COMMISSION =======================
export const updateUserCommission = async (req, res) => {
  try {
    const { commissionOverride } = req.body;

    // Allow null to clear the override (revert to global)
    if (
      commissionOverride !== null &&
      (isNaN(Number(commissionOverride)) ||
        Number(commissionOverride) < 0 ||
        Number(commissionOverride) > 1000)
    ) {
      return res
        .status(400)
        .json({ message: "Commission must be between 0 and 1000, or null to use global" });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.commissionOverride =
      commissionOverride === null || commissionOverride === ""
        ? null
        : Number(commissionOverride);

    await user.save();

    if (req.user) {
      await logAdminAction({
        adminId: req.user._id,
        adminEmail: req.user.email,
        action: "UPDATE_USER_COMMISSION",
        description:
          commissionOverride === null || commissionOverride === ""
            ? `Cleared commission override for ${user.email} (reverted to global)`
            : `Set commission override for ${user.email} to ${commissionOverride}%`,
        targetType: "user",
        targetId: user._id,
        ipAddress: req.ip,
      });
    }

    res.json({
      message: "Commission updated",
      commissionOverride: user.commissionOverride,
    });
  } catch (err) {
    console.error("UPDATE USER COMMISSION ERROR:", err);
    res.status(500).json({ message: "Commission update failed" });
  }
};

// ======================= PROMOTE =======================
export const promoteToAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    if (req.user._id.toString() === id) {
      return res.status(400).json({ message: "Cannot promote yourself" });
    }
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.isAdmin)
      return res.status(400).json({ message: "User is already admin" });

    user.isAdmin = true;
    await user.save();

    if (req.user) {
      await logAdminAction({
        adminId: req.user._id,
        adminEmail: req.user.email,
        action: "PROMOTE_ADMIN",
        description: `Promoted ${user.email} to admin`,
        targetType: "user",
        targetId: user._id,
        ipAddress: req.ip,
      });
    }

    res.json({
      message: "User promoted",
      user: { id: user._id, isAdmin: user.isAdmin },
      lastSeen: formatLastSeen(user.lastSeen),
    });
  } catch (err) {
    console.error("PROMOTE TO ADMIN ERROR:", err);
    res.status(500).json({ message: "Promotion failed" });
  }
};

// ======================= DEMOTE =======================
export const demoteFromAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    if (req.user._id.toString() === id) {
      return res.status(400).json({ message: "Cannot demote yourself" });
    }
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (!user.isAdmin)
      return res.status(400).json({ message: "User is not admin" });

    user.isAdmin = false;
    await user.save();

    if (req.user) {
      await logAdminAction({
        adminId: req.user._id,
        adminEmail: req.user.email,
        action: "DEMOTE_ADMIN",
        description: `Demoted ${user.email} from admin`,
        targetType: "user",
        targetId: user._id,
        ipAddress: req.ip,
      });
    }

    res.json({
      message: "User demoted",
      user: { id: user._id, isAdmin: user.isAdmin },
      lastSeen: formatLastSeen(user.lastSeen),
    });
  } catch (err) {
    console.error("DEMOTE FROM ADMIN ERROR:", err);
    res.status(500).json({ message: "Demotion failed" });
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

// ======================= BLOCK =======================
export const blockUser = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isBlocked: true },
      { new: true }
    );
    if (!user) return res.status(404).json({ message: "User not found" });

    if (req.user) {
      await logAdminAction({
        adminId: req.user._id,
        adminEmail: req.user.email,
        action: "BLOCK_USER",
        description: `Blocked ${user.email}`,
        targetType: "user",
        targetId: user._id,
        ipAddress: req.ip,
      });
    }

    res.json({
      ...user.toObject(),
      countryCode: normalizeCountryCode(user.countryCode),
      name: user.email.split("@")[0],
      lastSeen: formatLastSeen(user.lastSeen),
    });
  } catch (err) {
    console.error("BLOCK USER ERROR:", err);
    res.status(500).json({ message: "Block failed" });
  }
};

// ======================= UNBLOCK =======================
export const unblockUser = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isBlocked: false },
      { new: true }
    );
    if (!user) return res.status(404).json({ message: "User not found" });

    if (req.user) {
      await logAdminAction({
        adminId: req.user._id,
        adminEmail: req.user.email,
        action: "UNBLOCK_USER",
        description: `Unblocked ${user.email}`,
        targetType: "user",
        targetId: user._id,
        ipAddress: req.ip,
      });
    }

    res.json({
      ...user.toObject(),
      countryCode: normalizeCountryCode(user.countryCode),
      name: user.email.split("@")[0],
      lastSeen: formatLastSeen(user.lastSeen),
    });
  } catch (err) {
    console.error("UNBLOCK USER ERROR:", err);
    res.status(500).json({ message: "Unblock failed" });
  }
};

// ======================= FREEZE =======================
export const freezeUser = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isFrozen: true },
      { new: true }
    );
    if (!user) return res.status(404).json({ message: "User not found" });

    if (req.user && user) {
      await logAdminAction({
        adminId: req.user._id,
        adminEmail: req.user.email,
        action: "FREEZE_USER",
        description: `Froze ${user.email}`,
        targetType: "user",
        targetId: user._id,
        ipAddress: req.ip,
      });
    }

    res.json({
      ...user.toObject(),
      countryCode: normalizeCountryCode(user.countryCode),
      name: user.email.split("@")[0],
      lastSeen: formatLastSeen(user.lastSeen),
    });
  } catch (err) {
    console.error("FREEZE USER ERROR:", err);
    res.status(500).json({ message: "Freeze failed" });
  }
};

// ======================= UNFREEZE =======================
export const unfreezeUser = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isFrozen: false },
      { new: true }
    );
    if (!user) return res.status(404).json({ message: "User not found" });

    if (req.user && user) {
      await logAdminAction({
        adminId: req.user._id,
        adminEmail: req.user.email,
        action: "UNFREEZE_USER",
        description: `Unfroze ${user.email}`,
        targetType: "user",
        targetId: user._id,
        ipAddress: req.ip,
      });
    }

    res.json({
      ...user.toObject(),
      countryCode: normalizeCountryCode(user.countryCode),
      name: user.email.split("@")[0],
      lastSeen: formatLastSeen(user.lastSeen),
    });
  } catch (err) {
    console.error("UNFREEZE USER ERROR:", err);
    res.status(500).json({ message: "Unfreeze failed" });
  }
};

// ======================= DELETE =======================
export const deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    await User.findByIdAndDelete(req.params.id);
    await Order.deleteMany({ userId: req.params.id });
    await Wallet.deleteOne({ user: req.params.id });

    if (req.user) {
      await logAdminAction({
        adminId: req.user._id,
        adminEmail: req.user.email,
        action: "DELETE_USER",
        description: `Deleted user ${user.email}`,
        targetType: "user",
        targetId: user._id,
        ipAddress: req.ip,
      });
    }

    res.json({ message: "User deleted" });
  } catch (err) {
    console.error("DELETE USER ERROR:", err);
    res.status(500).json({ message: "Delete failed" });
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
