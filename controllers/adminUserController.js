import User from "../models/User.js";
import Order from "../models/Order.js";
import Wallet from "../models/Wallet.js";

// ✅ Single source of truth for balance
const calculateBalance = (transactions = []) =>
  transactions
    .filter(t => t.status === "Completed")
    .reduce((acc, t) => acc + (Number(t.amount) || 0), 0);

/**
 * GET /api/admin/users
 */
export const getAllUsers = async (req, res) => {
  try {
    const { search } = req.query;

    const query = search
      ? {
          $or: [
            { email: { $regex: search, $options: "i" } },
            { phone: { $regex: search, $options: "i" } },
          ],
        }
      : {};

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
        return { ...user.toObject(), balance, name };
      })
    );

    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch users" });
  }
};

/**
 * GET /api/admin/users/:id
 * ✅ NOW includes paginated orders
 */
export const getUserById = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    const user = await User.findById(req.params.id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });

    const wallet = await Wallet.findOne({ userId: user._id });
    const transactions = wallet?.transactions || [];
    const balance = calculateBalance(transactions);

    // ✅ PAGINATION
    const skip = (Number(page) - 1) * Number(limit);

    const [orders, totalOrders] = await Promise.all([
      Order.find({ userId: user._id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .select("service serviceLink charge quantity status createdAt"),

      Order.countDocuments({ userId: user._id }),
    ]);

    res.json({
      user: {
        ...user.toObject(),
        balance,
        name: user.email.split("@")[0],
      },

      transactions: transactions.sort(
        (a, b) =>
          new Date(b.createdAt || b.date) -
          new Date(a.createdAt || a.date)
      ),

      orders,

      pagination: {
        total: totalOrders,
        page: Number(page),
        pages: Math.ceil(totalOrders / limit),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch user" });
  }
};

/**
 * PUT /api/admin/users/:id/balance
 */
export const updateUserBalance = async (req, res) => {
  try {
    const newBalance = Number(req.body.balance);
    if (Number.isNaN(newBalance))
      return res.status(400).json({ message: "Invalid balance" });

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

    res.json({
      user: {
        ...user.toObject(),
        balance: wallet.balance,
        name: user.email.split("@")[0],
      },
      wallet,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Balance update failed" });
  }
};

/**
 * PATCH /api/admin/users/:id/promote
 */
export const promoteToAdmin = async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user._id.toString() === id)
      return res.status(400).json({ message: "Cannot promote yourself" });

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.isAdmin)
      return res.status(400).json({ message: "User is already admin" });

    user.isAdmin = true;
    await user.save();

    res.json({
      message: "User promoted",
      user: { id: user._id, isAdmin: user.isAdmin },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Promotion failed" });
  }
};

/**
 * PATCH /api/admin/users/:id/demote
 */
export const demoteFromAdmin = async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user._id.toString() === id)
      return res.status(400).json({ message: "Cannot demote yourself" });

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (!user.isAdmin)
      return res.status(400).json({ message: "User is not admin" });

    user.isAdmin = false;
    await user.save();

    res.json({
      message: "User demoted",
      user: { id: user._id, isAdmin: user.isAdmin },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Demotion failed" });
  }
};

/**
 * PATCH /api/admin/users/:id/block
 */
export const blockUser = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isBlocked: true },
      { new: true }
    );

    res.json({ ...user.toObject(), name: user.email.split("@")[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Block failed" });
  }
};

/**
 * PATCH /api/admin/users/:id/unblock
 */
export const unblockUser = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isBlocked: false },
      { new: true }
    );

    res.json({ ...user.toObject(), name: user.email.split("@")[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Unblock failed" });
  }
};

/**
 * 🆕 PATCH /api/admin/users/:id/freeze
 */
export const freezeUser = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isFrozen: true },
      { new: true }
    );

    res.json({ ...user.toObject(), name: user.email.split("@")[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Freeze failed" });
  }
};

/**
 * 🆕 PATCH /api/admin/users/:id/unfreeze
 */
export const unfreezeUser = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isFrozen: false },
      { new: true }
    );

    res.json({ ...user.toObject(), name: user.email.split("@")[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Unfreeze failed" });
  }
};

/**
 * DELETE /api/admin/users/:id
 */
export const deleteUser = async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    await Order.deleteMany({ user: req.params.id });
    await Wallet.deleteOne({ user: req.params.id });

    res.json({ message: "User deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Delete failed" });
  }
};

/**
 * GET /api/admin/users/:id/orders
 */
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
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch orders" });
  }
};

/**
 * GET /api/admin/users/:id/transactions
 */
export const getUserTransactions = async (req, res) => {
  try {
    const wallet = await Wallet.findOne({ user: req.params.id });

    if (!wallet)
      return res.status(404).json({ message: "Wallet not found" });

    res.json(wallet.transactions || []);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch transactions" });
  }
};
