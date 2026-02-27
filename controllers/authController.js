import User from "../models/User.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import sendEmail from "../utils/sendEmail.js"; // your email utility
import Wallet from "../models/Wallet.js";

// Generate JWT token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "7d" });
};

// ======================= REGISTER =======================
export const register = async (req, res) => {
  try {
    const { email, phone, country, password } = req.body;

    if (!email || !phone || !country || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Check if user exists
    const userExists = await User.findOne({
      $or: [{ email }, { phone }],
    });

    if (userExists) {
      return res
        .status(400)
        .json({ message: "User with email or phone already exists" });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user
    const user = await User.create({
      email,
      phone,
      country,
      password: hashedPassword,
    });

    // ✅ CREATE WALLET (ONLY ONCE)
    await Wallet.create({
      user: user._id,
      balance: 0,
    });

    res.status(201).json({
      _id: user._id,
      email: user.email,
      phone: user.phone,
      country: user.country,
      token: generateToken(user._id),

      // ✅ Set cookie for cross-site usage
    res.cookie("token", token, {
      httpOnly: true,
      secure: true,       // HTTPS required
      sameSite: "none",   // allows cross-site (Vercel → Render)
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.status(201).json({
      _id: user._id,
      email: user.email,
      phone: user.phone,
      country: user.country,
      token, // optional to still send in JSON
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

// ======================= LOGIN =======================
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ message: "Email and password required" });

    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ message: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: "Invalid credentials" });

    res.json({
      _id: user._id,
      email: user.email,
      phone: user.phone,
      country: user.country,
      isAdmin: user.isAdmin,
      token: generateToken(user._id),

      // ✅ Set cookie
    res.cookie("token", token, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      _id: user._id,
      email: user.email,
      phone: user.phone,
      country: user.country,
      isAdmin: user.isAdmin,
      token, // optional
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

// ======================= FORGOT PASSWORD =======================
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) return res.status(404).json({ message: "User not found" });

    // Generate reset token (expires in 1 hour)
    const resetToken = crypto.randomBytes(32).toString("hex");
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpire = Date.now() + 3600000; // 1 hour
    await user.save();

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
    const message = `Click here to reset your password: ${resetUrl}`;

    try {
      await sendEmail({
        to: user.email,
        subject: "Password Reset",
        text: message,
      });

      res.json({ message: "Password reset link sent to email" });
    } catch (err) {
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;
      await user.save();
      res.status(500).json({ message: "Failed to send email" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

// ======================= RESET PASSWORD =======================
export const resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { newPassword } = req.body;

    if (!newPassword)
      return res.status(400).json({ message: "New password is required" });

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpire: { $gt: Date.now() },
    });

    if (!user) return res.status(400).json({ message: "Invalid or expired token" });

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;

    await user.save();

    res.json({ message: "Password reset successful" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

// Helper to calculate balance from transactions
const calculateBalance = (transactions) => {
  return transactions?.reduce((acc, t) => acc + (t.amount || 0), 0) || 0;
};

// ======================= GET USER PROFILE =======================
export const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });

    // ✅ Fetch wallet
    const wallet = await Wallet.findOne({ user: user._id });

    res.json({
      ...user.toObject(),
      balance: wallet?.balance || 0, 
      transaction: wallet?.transactions || [],
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};
