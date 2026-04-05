// controllers/authController.js

import User from "../models/User.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import sendEmail from "../utils/sendEmail.js";
import Wallet from "../models/Wallet.js";
import logAdminAction from "../utils/logAdminAction.js";

// ======================= CONFIG =======================

// Generate JWT token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "7d" });
};

// ✅ CENTRALIZED COOKIE CONFIG (FIXED)
const getCookieOptions = () => {
  const isProd = process.env.NODE_ENV === "production";

  return {
    httpOnly: true,
    secure: isProd, // only true in production
    sameSite: isProd ? "none" : "lax", // ✅ FIXED
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
};

// ======================= REGISTER =======================
export const register = async (req, res) => {
  try {
    const { email, phone, country, countryCode, password } = req.body;

    if (!email || !phone || !country || !countryCode || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const userExists = await User.findOne({ $or: [{ email }, { phone }] });
    if (userExists) {
      return res.status(400).json({
        message: "User with email or phone already exists",
      });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const resellerOwner = req.reseller?._id || null;

    const user = await User.create({
      email,
      phone,
      country,
      countryCode,
      password: hashedPassword,
      resellerOwner,
    });

    await Wallet.create({ user: user._id, balance: 0 });

    const token = generateToken(user._id);

    // ✅ FIXED COOKIE
    res.cookie("token", token, getCookieOptions());

    if (req.user?.isAdmin && req.user._id) {
      logAdminAction({
        adminId: req.user._id,
        adminEmail: req.user.email,
        action: "REGISTER_USER",
        description: `Admin created user ${user.email}`,
        targetType: "user",
        targetId: user._id,
        ipAddress: req.ip,
      }).catch((err) =>
        console.error("Admin log error (REGISTER):", err.message)
      );
    }

    res.status(201).json({
      _id: user._id,
      email: user.email,
      phone: user.phone,
      country: user.country,
      countryCode: user.countryCode,
      isAdmin: user.isAdmin || false,
      isReseller: user.isReseller || false,
      token,
    });
  } catch (error) {
    console.error("REGISTER ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// ======================= LOGIN =======================
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password required" });
    }

    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ message: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: "Invalid credentials" });

    if (user.isBlocked) {
      return res.status(403).json({
        message: "Your account has been blocked. Contact support.",
      });
    }

    const token = generateToken(user._id);

    // ✅ FIXED COOKIE
    res.cookie("token", token, getCookieOptions());

    if (user.isAdmin && user._id) {
      logAdminAction({
        adminId: user._id,
        adminEmail: user.email,
        action: "ADMIN_LOGIN",
        description: `Admin ${user.email} logged in`,
        ipAddress: req.ip,
      }).catch((err) =>
        console.error("Admin log error (LOGIN):", err.message)
      );
    }

    res.json({
      _id: user._id,
      email: user.email,
      phone: user.phone,
      country: user.country,
      countryCode: user.countryCode,
      isReseller: user.isReseller,
      isAdmin: user.isAdmin,
      token,
    });
  } catch (error) {
    console.error("LOGIN ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// ======================= FORGOT PASSWORD =======================
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });

    const resetToken = crypto.randomBytes(32).toString("hex");

    user.resetPasswordToken = resetToken;
    user.resetPasswordExpire = Date.now() + 3600000;

    await user.save();

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
    const message = `Click here to reset your password: ${resetUrl}`;

    try {
      await sendEmail({
        to: user.email,
        subject: "Password Reset",
        text: message,
      });

      if (req.user?.isAdmin && req.user._id) {
        logAdminAction({
          adminId: req.user._id,
          adminEmail: req.user.email,
          action: "FORGOT_PASSWORD",
          description: `Admin triggered password reset for ${user.email}`,
          targetType: "user",
          targetId: user._id,
          ipAddress: req.ip,
        }).catch((err) =>
          console.error("Admin log error (FORGOT):", err.message)
        );
      }

      res.json({ message: "Password reset link sent to email" });
    } catch (err) {
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;
      await user.save();

      res.status(500).json({ message: "Failed to send email" });
    }
  } catch (error) {
    console.error("FORGOT PASSWORD ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// ======================= RESET PASSWORD =======================
export const resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { newPassword } = req.body;

    if (!newPassword) {
      return res.status(400).json({ message: "New password is required" });
    }

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpire: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);

    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;

    await user.save();

    if (req.user?.isAdmin && req.user._id) {
      logAdminAction({
        adminId: req.user._id,
        adminEmail: req.user.email,
        action: "RESET_PASSWORD",
        description: `Admin reset password for ${user.email}`,
        targetType: "user",
        targetId: user._id,
        ipAddress: req.ip,
      }).catch((err) =>
        console.error("Admin log error (RESET):", err.message)
      );
    }

    res.json({ message: "Password reset successful" });
  } catch (error) {
    console.error("RESET PASSWORD ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// ======================= GET PROFILE =======================
export const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");

    if (!user) return res.status(404).json({ message: "User not found" });

    const wallet = await Wallet.findOne({ user: user._id });

    if (user.isAdmin && user._id) {
      logAdminAction({
        adminId: user._id,
        adminEmail: user.email,
        action: "VIEW_PROFILE",
        description: `Admin ${user.email} viewed profile`,
        ipAddress: req.ip,
      }).catch((err) =>
        console.error("Admin log error (PROFILE):", err.message)
      );
    }

    res.json({
      ...user.toObject(),
      isReseller: user.isReseller,
      balance: wallet?.balance || 0,
      transaction: wallet?.transactions || [],
    });
  } catch (error) {
    console.error("GET PROFILE ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};
