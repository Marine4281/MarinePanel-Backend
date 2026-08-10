// controllers/paymentAlertsController.js
// Lightweight pending-count endpoints for sidebar badges (deposits + withdrawals combined)

import Transaction from "../models/Transaction.js";

// ─── MAIN ADMIN: count of pending requests admin is responsible for ───
// Includes direct platform users AND platform-connected CP gateway
// transactions (approverScope "admin" either way) — not CP-owned-gateway
// transactions, which are the CP owner's to review.
export const adminPaymentsUnreadCount = async (req, res) => {
  try {
    const count = await Transaction.countDocuments({
      status:        "Pending",
      type:          { $in: ["Deposit", "Withdrawal"] },
      approverScope: "admin",
    });
    res.json({ count });
  } catch (err) {
    console.error("adminPaymentsUnreadCount error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── CP OWNER: count of pending requests for their own end users, on their own gateways ───
export const cpPaymentsUnreadCount = async (req, res) => {
  try {
    const count = await Transaction.countDocuments({
      status:          "Pending",
      type:            { $in: ["Deposit", "Withdrawal"] },
      childPanelOwner: req.user._id,
      approverScope:   "cp",
    });
    res.json({ count });
  } catch (err) {
    console.error("cpPaymentsUnreadCount error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};
