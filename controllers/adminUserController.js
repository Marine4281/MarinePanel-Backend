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
 * Fetch users and auto-fix wallet balances
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

          // Fix wallet balance if outdated
          if (wallet.balance !== computed) {
            wallet.balance = computed;
            await wallet.save();
          }
          balance = computed;

          // Sync User.balance
          if (user.balance !== balance) {
            await User.findByIdAndUpdate(user._id, { balance });
          }
        }

        // Always return a name derived from email
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
 * PUT /api/admin/users/:id/balance
 * Admin sets user balance (always creates Admin Adjustment)
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
      // 🆕 create wallet with initial transaction
      wallet = await Wallet.create({
        user: user._id,
        transactions: [
          {
            type: "Admin Adjustment",
            amount: newBalance,
            status: "Completed",
            note: "Initial balance set by admin",
          },
        ],
      });
    } else {
      // 🔁 calculate current balance and create adjustment if needed
      const current = calculateBalance(wallet.transactions);
      const diff = newBalance - current;

      if (diff !== 0) {
        wallet.transactions.push({
          type: "Admin Adjustment",
          amount: diff,
          status: "Completed",
          note: "Balance updated by admin",
        });
      }
    }

    // persist balance from transactions (single source of truth)
    wallet.balance = calculateBalance(wallet.transactions);
    await wallet.save();

    // 🔔 Real-time update
    const io = req.app.get("io");
    io?.emit("wallet:update", {
      userId: user._id.toString(),
      balance: wallet.balance,
      transactions: wallet.transactions,
    });

    // Sync to User
    await User.findByIdAndUpdate(user._id, { balance: wallet.balance });

    const name = user.email.split("@")[0]; // ← derived name
    res.json({ user: { ...user.toObject(), balance: wallet.balance, name }, wallet });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Balance update failed" });
  }
};

/**
 * Block / Unblock user
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
 * DELETE user and related data
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
 * GET user orders
 */
export const getUserOrders = async (req, res) => {
  try {
    const orders = await Order.find({ user: req.params.id }).sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch user orders" });
  }
};

/**
 * GET user transactions
 */
export const getUserTransactions = async (req, res) => {
  try {
    const wallet = await Wallet.findOne({ user: req.params.id });
    if (!wallet) return res.status(404).json({ message: "Wallet not found" });

    res.json(wallet.transactions || []);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch transactions" });
  }
};