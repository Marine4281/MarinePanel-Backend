// controllers/authController.js

import User from "../models/User.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import sendEmail from "../utils/sendEmail.js";
import Wallet from "../models/Wallet.js";
import logAdminAction from "../utils/logAdminAction.js";

// ======================= HELPERS =======================

const generateToken = (user) => {
  return jwt.sign({ id: user._id, scope: user.scope}, process.env.JWT_SECRET, { expiresIn: "7d" });
};

const getCookieOptions = () => {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
};

const normalizeCountryCode = (value) => {
  if (!value || typeof value !== "string") return "US";
  const map = {
    "united states": "US",
    "usa": "US",
    "us": "US",
    "kenya": "KE",
  };
  const cleaned = value.trim().toLowerCase();
  return map[cleaned] || cleaned.toUpperCase();
};

// ======================= REGISTER =======================
export const register = async (req, res) => {
  try {
    let { email, phone, country, countryCode, password } = req.body;

    if (!email || !phone || !country || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    email = email.trim().toLowerCase();
    phone = phone.trim();
    country = country.trim();
    countryCode = normalizeCountryCode(countryCode || country);

    /*
    SCOPE ISOLATION
    req.scope is set by scopeMiddleware before this runs.
    'platform'   = registering on marinepanel.online
    <ObjectId>   = registering on a child panel domain

    We check email AND phone within the same scope only.
    Same email on two different child panels = two separate accounts.
    No cross-panel lookup ever happens.
    */
    const scope = req.scope || "platform";

    const userExists = await User.findOne({
      $or: [{ email }, { phone }],
      scope,
    });

    if (userExists) {
      return res.status(400).json({
        message: "User with email or phone already exists",
      });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const resellerOwner = req.reseller?._id || null;

    /*
    childPanelOwner — if the request is coming from a child panel
    domain, we stamp the child panel owner's _id on this user so
    we always know which child panel they belong to.
    */
    const childPanelOwner = req.childPanel?._id || null;

    const user = await User.create({
      email,
      phone,
      country,
      countryCode,
      password: hashedPassword,
      resellerOwner,
      childPanelOwner,
      scope,
    });

    await Wallet.create({ user: user._id, balance: 0 });

    const token = generateToken(user);

    res.cookie("token", token, getCookieOptions());

    if (req.user && req.user.isAdmin) {
      await logAdminAction({
        adminId: req.user._id,
        adminEmail: req.user.email,
        action: "REGISTER_USER",
        description: `Admin created user ${user.email}`,
        targetType: "user",
        targetId: user._id,
        ipAddress: req.ip,
      });
    }

    res.status(201).json({
      _id: user._id,
      email: user.email,
      phone: user.phone,
      country: user.country,
      countryCode: user.countryCode,
      isAdmin: user.isAdmin || false,
      isReseller: user.isReseller || false,
      isChildPanel: user.isChildPanel || false,
      scope: user.scope,
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
    let { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password required" });
    }

    email = email.trim().toLowerCase();

    /*
    SCOPE ISOLATION
    Look up user by email AND scope together.
    A user on Child Panel A trying to log in on Child Panel B
    gets "Invalid credentials" — we never reveal they exist
    elsewhere. No fallback to platform or other panels.
    */
    const scope = req.scope || "platform";

    const user = await User.findOne({ email, scope });
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    if (user.isBlocked) {
      return res.status(403).json({
        message: "Your account has been blocked. Contact support.",
      });
    }

    // If this user is a child panel owner and their panel is suspended
    if (user.isChildPanel && !user.childPanelIsActive) {
      return res.status(403).json({
        message: "Your panel has been suspended. Contact support.",
      });
    }

    const token = generateToken(user);
    res.cookie("token", token, getCookieOptions());

    if (user.isAdmin) {
      await logAdminAction({
        adminId: user._id,
        adminEmail: user.email,
        action: "ADMIN_LOGIN",
        description: `Admin ${user.email} logged in`,
        ipAddress: req.ip,
      });
    }

    res.json({
      _id: user._id,
      email: user.email,
      phone: user.phone,
      country: user.country,
      countryCode: user.countryCode,
      isReseller: user.isReseller,
      isAdmin: user.isAdmin,
      isChildPanel: user.isChildPanel || false,
      childPanelIsActive: user.childPanelIsActive,
      scope: user.scope,
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

    /*
    SCOPE ISOLATION
    Password reset only works within the same panel scope.
    A reset link triggered from Child Panel A will not reset
    an account that exists on Child Panel B or the main platform.
    */
    const scope = req.scope || "platform";

    const user = await User.findOne({
      email: email?.trim().toLowerCase(),
      scope,
    });

    // Always return the same message whether user exists or not
    // to avoid revealing which panels an email is registered on
    if (!user) {
      return res.json({ message: "Password reset link sent to email" });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");

    user.resetPasswordToken = resetToken;
    user.resetPasswordExpire = Date.now() + 3600000;

    await user.save();

    /*
    Build reset URL using the current panel's domain so the
    reset link takes the user back to the correct panel.
    */
    const panelDomain =
      req.childPanel
        ? req.brand?.domain
        : process.env.FRONTEND_URL;

    const resetUrl = `${panelDomain}/reset-password/${resetToken}`;

    try {
      await sendEmail({
        to: user.email,
        subject: "Password Reset",
        text: `Click here to reset your password: ${resetUrl}`,
      });

      if (req.user && req.user.isAdmin) {
        await logAdminAction({
          adminId: req.user._id,
          adminEmail: req.user.email,
          action: "FORGOT_PASSWORD",
          description: `Admin triggered password reset for ${user.email}`,
          targetType: "user",
          targetId: user._id,
          ipAddress: req.ip,
        });
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

    /*
    SCOPE ISOLATION
    Reset token lookup is also scoped so a reset token from
    one panel cannot reset a password on another panel.
    */
    const scope = req.scope || "platform";

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpire: { $gt: Date.now() },
      scope,
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);

    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;

    await user.save();

    if (req.user && req.user.isAdmin) {
      await logAdminAction({
        adminId: req.user._id,
        adminEmail: req.user.email,
        action: "RESET_PASSWORD",
        description: `Admin reset password for ${user.email}`,
        targetType: "user",
        targetId: user._id,
        ipAddress: req.ip,
      });
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

    if (user.isAdmin) {
      await logAdminAction({
        adminId: user._id,
        adminEmail: user.email,
        action: "VIEW_PROFILE",
        description: `Admin ${user.email} viewed profile`,
        ipAddress: req.ip,
      });
    }

    res.json({
      ...user.toObject(),
      countryCode: user.countryCode,
      isReseller: user.isReseller,
      isChildPanel: user.isChildPanel || false,
      childPanelIsActive: user.childPanelIsActive,
      scope: user.scope,
      balance: wallet?.balance || 0,
      transaction: wallet?.transactions || [],
    });
  } catch (error) {
    console.error("GET PROFILE ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};
