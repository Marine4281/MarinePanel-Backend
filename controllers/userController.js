import User from "../models/User.js";
import Wallet from "../models/Wallet.js";
import bcrypt from "bcryptjs";

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

    res.json({
      ...user.toObject(),
      balance,
      name: user.email.split("@")[0], // ← derived from email
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

    res.json({
      _id: user._id,
      email: user.email,
      phone: user.phone,
      country: user.country,
      isAdmin: user.isAdmin,
      createdAt: user.createdAt,
      balance,
      name: user.email.split("@")[0], // ← derived from email
    });

  } catch (error) {
    console.error("UPDATE PROFILE ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// =======================
// ADMIN: PROMOTE USER TO ADMIN
// =======================
export const promoteToAdmin = async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user._id.toString() === id) {
      return res.status(400).json({ message: "You cannot promote yourself" });
    }

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.isAdmin) return res.status(400).json({ message: "User is already an admin" });

    user.isAdmin = true;
    await user.save();

    res.status(200).json({
      message: `${user.email} has been promoted to admin`,
      user: { id: user._id, email: user.email, isAdmin: user.isAdmin },
    });
  } catch (error) {
    console.error("PROMOTE TO ADMIN ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// =======================
// ADMIN: DEMOTE USER FROM ADMIN
// =======================
export const demoteFromAdmin = async (req, res) => {
  try {
    const { id } = req.params;

    // Prevent self-demotion
    if (req.user._id.toString() === id) {
      return res.status(400).json({ message: "You cannot demote yourself" });
    }

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (!user.isAdmin)
      return res.status(400).json({ message: "User is not an admin" });

    user.isAdmin = false;
    await user.save();

    res.status(200).json({
      message: `${user.email} has been demoted to regular user`,
      user: { id: user._id, email: user.email, isAdmin: user.isAdmin },
    });
  } catch (error) {
    console.error("DEMOTE USER ERROR:", error);
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

    res.json({
      _id: user._id,
      email: user.email,
      phone: user.phone,
      balance,
      name: user.email.split("@")[0], // ← derived from email
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

    res.json(wallet.transactions || []);
  } catch (error) {
    console.error("GET USER TRANSACTIONS ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Get single user by ID (admin only)
export const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};
