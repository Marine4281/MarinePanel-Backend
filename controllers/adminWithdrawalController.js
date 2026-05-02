// controllers/adminWithdrawalController.js
//
// Main admin reviewing and processing child panel
// withdrawal requests.
//
// Approve → marks transaction Completed, balance recalc picks it up
// Reject  → marks transaction Failed, pushes a refund transaction
//           so the balance is restored

import User from "../models/User.js";
import Wallet from "../models/Wallet.js";

const calculateBalance = (transactions = []) =>
  transactions
    .filter((t) => t.status === "Completed")
    .reduce((acc, t) => acc + (Number(t.amount) || 0), 0);

/* =========================================================
GET ALL PENDING WITHDRAWALS
GET /admin/withdrawals/pending
========================================================= */
export const getPendingWithdrawals = async (req, res) => {
  try {
    // Find all child panel owners who have pending withdrawals
    const cpOwners = await User.find({
      isChildPanel: true,
    }).select("_id email childPanelBrandName");

    const ownerIds = cpOwners.map((u) => u._id);

    const wallets = await Wallet.find({
      user: { $in: ownerIds },
    }).lean();

    const pending = [];

    wallets.forEach((wallet) => {
      const owner = cpOwners.find(
        (u) => u._id.toString() === wallet.user.toString()
      );

      wallet.transactions.forEach((tx, index) => {
        if (tx.type === "Withdrawal" && tx.status === "Pending") {
          pending.push({
            walletId: wallet._id,
            txIndex: index,
            txId: tx._id,
            userId: wallet.user,
            email: owner?.email || "—",
            brandName: owner?.childPanelBrandName || "—",
            amount: Math.abs(tx.amount),
            note: tx.note,
            createdAt: tx.createdAt,
          });
        }
      });
    });

    // Sort newest first
    pending.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({ success: true, data: pending });
  } catch (err) {
    console.error("GET PENDING WITHDRAWALS ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* =========================================================
APPROVE WITHDRAWAL
POST /admin/withdrawals/:userId/:txId/approve
========================================================= */
export const approveWithdrawal = async (req, res) => {
  try {
    const { userId, txId } = req.params;

    const wallet = await Wallet.findOne({ user: userId });
    if (!wallet) {
      return res.status(404).json({ message: "Wallet not found" });
    }

    const tx = wallet.transactions.id(txId);
    if (!tx) {
      return res.status(404).json({ message: "Transaction not found" });
    }

    if (tx.type !== "Withdrawal" || tx.status !== "Pending") {
      return res.status(400).json({
        message: "Transaction is not a pending withdrawal",
      });
    }

    // Mark as completed — balance recalc will now include this deduction
    tx.status = "Completed";
    wallet.balance = calculateBalance(wallet.transactions);
    await wallet.save();

    // Emit wallet update to child panel owner
    const io = req.app.get("io");
    if (io) {
      io.emit("wallet:update", {
        userId,
        balance: wallet.balance,
      });
    }

    res.json({ success: true, message: "Withdrawal approved" });
  } catch (err) {
    console.error("APPROVE WITHDRAWAL ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* =========================================================
REJECT WITHDRAWAL
POST /admin/withdrawals/:userId/:txId/reject
========================================================= */
export const rejectWithdrawal = async (req, res) => {
  try {
    const { userId, txId } = req.params;
    const { reason } = req.body;

    const wallet = await Wallet.findOne({ user: userId });
    if (!wallet) {
      return res.status(404).json({ message: "Wallet not found" });
    }

    const tx = wallet.transactions.id(txId);
    if (!tx) {
      return res.status(404).json({ message: "Transaction not found" });
    }

    if (tx.type !== "Withdrawal" || tx.status !== "Pending") {
      return res.status(400).json({
        message: "Transaction is not a pending withdrawal",
      });
    }

    // Mark original as Failed
    tx.status = "Failed";

    // Push a refund so balance is restored
    wallet.transactions.push({
      type: "Refund",
      amount: Math.abs(tx.amount),
      status: "Completed",
      note: `Withdrawal rejected${reason ? `: ${reason}` : ""}`,
      createdAt: new Date(),
    });

    wallet.balance = calculateBalance(wallet.transactions);
    await wallet.save();

    const io = req.app.get("io");
    if (io) {
      io.emit("wallet:update", {
        userId,
        balance: wallet.balance,
      });
    }

    res.json({ success: true, message: "Withdrawal rejected and refunded" });
  } catch (err) {
    console.error("REJECT WITHDRAWAL ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};
