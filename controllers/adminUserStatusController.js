// controllers/adminUserStatusController.js

import User from "../models/User.js";
import Order from "../models/Order.js";
import Wallet from "../models/Wallet.js";
import logAdminAction from "../utils/logAdminAction.js";
import formatLastSeen from "../utils/formatLastSeen.js";
import { normalizeCountryCode } from "../utils/adminUserHelpers.js";

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
