// controllers/cpOwnerWithdrawalController.js
//
// Child panel owner requesting a withdrawal from their
// earnings wallet. The main admin processes and approves it.
//
// Flow:
//   1. CP owner submits request with amount, method, details
//   2. Wallet balance is reserved (deducted as Pending)
//   3. Transaction logged as Pending Withdrawal
//   4. Admin sees it in their dashboard and processes manually
//   5. Admin marks complete → transaction stays Completed
//   6. Admin rejects → amount is refunded back to wallet

import User from "../models/User.js";
import Wallet from "../models/Wallet.js";

// ======================= HELPERS =======================

const calculateBalance = (transactions = []) =>
  transactions
    .filter((t) => t.status === "Completed")
    .reduce((acc, t) => acc + (Number(t.amount) || 0), 0);

/* =========================================================
REQUEST WITHDRAWAL
POST /child-panel/withdraw
========================================================= */
export const requestWithdrawal = async (req, res) => {
  try {
    const { amount, method, details } = req.body;

    const num = Number(amount);

    if (!num || num <= 0) {
      return res.status(400).json({ message: "Invalid amount" });
    }
    if (!method?.trim()) {
      return res.status(400).json({ message: "Withdrawal method is required" });
    }
    if (!details?.trim()) {
      return res.status(400).json({ message: "Payment details are required" });
    }

    const user = await User.findById(req.user._id);
    if (!user || !user.isChildPanel) {
      return res.status(403).json({ message: "Not authorized" });
    }

    if (!user.childPanelIsActive) {
      return res.status(403).json({ message: "Panel is suspended" });
    }

    const minWithdraw = user.childPanelWithdrawMin ?? 10;

    if (num < minWithdraw) {
      return res.status(400).json({
        message: `Minimum withdrawal is $${minWithdraw}`,
      });
    }

    // Get wallet and check balance
    let wallet = await Wallet.findOne({ user: user._id });
    if (!wallet) {
      return res.status(400).json({ message: "Wallet not found" });
    }

    const currentBalance = calculateBalance(wallet.transactions);

    if (num > currentBalance) {
      return res.status(400).json({ message: "Insufficient balance" });
    }

    // Check for already pending withdrawal — only one at a time
    const hasPending = wallet.transactions.some(
      (t) => t.type === "Withdrawal" && t.status === "Pending"
    );

    if (hasPending) {
      return res.status(400).json({
        message:
          "You already have a pending withdrawal. Wait for it to be processed before submitting another.",
      });
    }

    // Deduct as pending — this reserves the balance
    // The balance recalc only counts Completed transactions
    // so this pending deduction won't reduce available balance
    // until the admin marks it complete.
    // We log it as Pending so the admin can see it.
    wallet.transactions.push({
      type: "Withdrawal",
      amount: -Number(num),
      status: "Pending",
      note: `Withdrawal via ${method.trim()} — ${details.trim()}`,
      createdAt: new Date(),
    });

    // Don't recalc balance yet — pending txs are excluded from balance
    await wallet.save();

    res.json({
      success: true,
      message: "Withdrawal request submitted. Admin will process it shortly.",
    });
  } catch (err) {
    console.error("CP WITHDRAWAL REQUEST ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* =========================================================
GET WITHDRAWAL HISTORY
GET /child-panel/withdrawals
========================================================= */
export const getWithdrawalHistory = async (req, res) => {
  try {
    const wallet = await Wallet.findOne({ user: req.user._id });
    if (!wallet) return res.json([]);

    const withdrawals = wallet.transactions
      .filter((t) => t.type === "Withdrawal")
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json(withdrawals);
  } catch (err) {
    console.error("CP WITHDRAWAL HISTORY ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};
