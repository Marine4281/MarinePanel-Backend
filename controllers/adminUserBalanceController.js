// controllers/adminUserBalanceController.js

import User from "../models/User.js";
import Wallet from "../models/Wallet.js";
import logAdminAction from "../utils/logAdminAction.js";
import formatLastSeen from "../utils/formatLastSeen.js";
import { calcBalance } from "../utils/gatewayHelpers.js"; // ✅ single source of truth
import { normalizeCountryCode } from "../utils/adminUserHelpers.js";

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
      const current = calcBalance(wallet.transactions);
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

    wallet.balance = calcBalance(wallet.transactions);
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
