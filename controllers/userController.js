//controllers/userController.js
import User from "../models/User.js";
import Wallet from "../models/Wallet.js";
import bcrypt from "bcryptjs";
import logAdminAction from "../utils/logAdminAction.js";

// =======================
// GET LOGGED-IN USER PROFILE
// =======================
export const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const wallet = await Wallet.findOne({ user: user._id });
    const balance = wallet?.transactions.reduce((acc, t) => acc + t.amount, 0) || 0;

    // 🔥 Log if admin views profile
    if (user.isAdmin) {
      await logAdminAction(
        user._id,
        "VIEW_PROFILE",
        `Admin ${user.email} viewed profile`
      );
    }

    res.json({
      ...user.toObject(),
      balance,
      name: user.email.split("@")[0],
    });

  } catch (error) {
    console.error("GET PROFILE ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// =======================
// UPDATE LOGGED-IN USER PROFILE
// =======================
export const updateProfile = async (req, res) => {
  try {
    const { phone, country, password } = req.body;

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (phone) user.phone = phone;
    if (country) user.country = country;

    if (password) {
      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(password, salt);
    }

    await user.save();

    const wallet = await Wallet.findOne({ user: user._id });
    const balance = wallet?.transactions.reduce((acc, t) => acc + t.amount, 0) || 0;

    // 🔥 Log if admin updates profile
    if (user.isAdmin) {
      await logAdminAction(
        user._id,
        "UPDATE_PROFILE",
        `Admin ${user.email} updated profile`
      );
    }

    res.json({
      _id: user._id,
      email: user.email,
      phone: user.phone,
      country: user.country,
      isAdmin: user.isAdmin,
      createdAt: user.createdAt,
      balance,
      name: user.email.split("@")[0],
    });

  } catch (error) {
    console.error("UPDATE PROFILE ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};


// =======================
// ADMIN: EDIT USER BALANCE
// =======================
export const updateUserBalance = async (req, res) => {
  try {
    const { balance } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    let wallet = await Wallet.findOne({ user: user._id });
    if (!wallet) {
      wallet = await Wallet.create({ user: user._id, transactions: [] });
    }

    const currentBalance = wallet.transactions.reduce((acc, t) => acc + t.amount, 0);
    const difference = balance - currentBalance;

    if (difference !== 0) {
      wallet.transactions.push({
        type: "Admin Adjustment",
        amount: difference,
        status: "Completed",
        note: "Balance updated by admin",
        createdAt: new Date(),
      });
    }

    await wallet.save();

    // 🔥 Log admin balance update
    await logAdminAction(
      req.user._id,
      "UPDATE_BALANCE",
      `Updated balance for ${user.email} to ${balance}`
    );

    res.json({
      _id: user._id,
      email: user.email,
      phone: user.phone,
      balance,
      name: user.email.split("@")[0],
    });

  } catch (error) {
    console.error("UPDATE USER BALANCE ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// =======================
// ADMIN: GET USER TRANSACTIONS
// =======================
export const getUserTransactions = async (req, res) => {
  try {
    const wallet = await Wallet.findOne({ user: req.params.id });
    if (!wallet) return res.status(404).json({ message: "Wallet not found" });

    // 🔥 Log admin viewing transactions
    await logAdminAction(
      req.user._id,
      "VIEW_TRANSACTIONS",
      `Viewed transactions for user ${req.params.id}`
    );

    res.json(wallet.transactions || []);
  } catch (error) {
    console.error("GET USER TRANSACTIONS ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};
