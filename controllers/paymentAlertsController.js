// controllers/paymentAlertsController.js
// Lightweight pending-count endpoints for sidebar badges (deposits + withdrawals combined)

import Transaction from "../models/Transaction.js";

// ─── MAIN ADMIN: count of pending platform-level deposit/withdraw requests ───
export const adminPaymentsUnreadCount = async (req, res) => {
  try {
    const count = await Transaction.countDocuments({
      status: "Pending",
      type: { $in: ["Deposit", "Withdrawal"] },
      childPanelOwner: null,
    });
    res.json({ count });
  } catch (err) {
    console.error("adminPaymentsUnreadCount error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── CP OWNER: count of pending deposit/withdraw requests for their own end users ───
export const cpPaymentsUnreadCount = async (req, res) => {
  try {
    const count = await Transaction.countDocuments({
      status: "Pending",
      type: { $in: ["Deposit", "Withdrawal"] },
      childPanelOwner: req.user._id,
    });
    res.json({ count });
  } catch (err) {
    console.error("cpPaymentsUnreadCount error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};
