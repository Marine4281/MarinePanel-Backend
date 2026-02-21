import Wallet from "../models/Wallet.js";
import User from "../models/User.js";
import PaymentMethod from "../models/PaymentMethod.js";
import { v4 as uuidv4 } from "uuid"; // npm i uuid

// ✅ Calculate completed transactions
const calculateCompletedBalance = (transactions = []) =>
  transactions
    .filter(t => t.status === "Completed")
    .reduce((acc, t) => acc + Number(t.amount || 0), 0);

// ================= GET WALLET =================
export const getWallet = async (req, res) => {
  try {
    let wallet = await Wallet.findOne({ user: req.user.id });

    if (!wallet) {
      wallet = await Wallet.create({ user: req.user.id, transactions: [] });
    }

    const balance = calculateCompletedBalance(wallet.transactions);
    wallet.balance = balance;
    await wallet.save();

    res.json({ ...wallet.toObject(), balance });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// ================= WITHDRAW FUNDS =================
export const withdrawFunds = async (req, res) => {
  try {
    const { amount, method } = req.body;
    if (!amount || !method) {
      return res.status(400).json({ message: "Amount and method required" });
    }

    const wallet = await Wallet.findOne({ user: req.user.id });
    if (!wallet) return res.status(404).json({ message: "Wallet not found" });

    const availableBalance = calculateCompletedBalance(wallet.transactions);
    if (availableBalance < amount) {
      return res.status(400).json({ message: "Insufficient balance" });
    }

    const transaction = {
      type: "Withdrawal",
      amount: -Number(amount),
      status: "Pending",
      note: `Method: ${method}`,
      reference: uuidv4(),
    };

    wallet.transactions.push(transaction);
    wallet.balance = calculateCompletedBalance(wallet.transactions);
    await wallet.save();

    req.app.get("io").emit("wallet:update", {
      userId: req.user.id,
      balance: wallet.balance,
      transactions: wallet.transactions,
    });

    res.status(201).json({
      message: "Withdrawal request submitted",
      wallet: { ...wallet.toObject(), balance: wallet.balance },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// ================= WALLET STATS FOR ADMIN =================
export const getWalletStats = async (req, res) => {
  try {
    const wallets = await Wallet.find({});
    let totalBalance = 0;
    let totalUsed = 0;

    wallets.forEach(wallet => {
      const completed = wallet.transactions.filter(t => t.status === "Completed");

      const moneyIn = completed
        .filter(t => t.amount > 0)
        .reduce((acc, t) => acc + t.amount, 0);

      const moneyOut = completed
        .filter(t => t.amount < 0)
        .reduce((acc, t) => acc + Math.abs(t.amount), 0);

      totalBalance += moneyIn - moneyOut;
      totalUsed += moneyOut;
    });

    res.json({
      totalBalance: Number(totalBalance.toFixed(2)),
      totalUsed: Number(totalUsed.toFixed(2)),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch wallet stats" });
  }
};

// ================= OPTIONAL MANUAL DEPOSIT =================
export const addFundsManual = async (req, res) => {
  try {
    const { amount, methodId, paymentDetails } = req.body;
    if (!amount || !methodId) {
      return res.status(400).json({ message: "Amount and payment method required" });
    }

    const method = await PaymentMethod.findById(methodId);
    if (!method || !method.isVisible) {
      return res.status(404).json({ message: "Payment method not found" });
    }

    if (Number(amount) < method.minDeposit) {
      return res.status(400).json({
        message: `Minimum deposit for this method is ${method.minDeposit}`,
      });
    }

    let wallet = await Wallet.findOne({ user: req.user.id });
    if (!wallet) wallet = await Wallet.create({ user: req.user.id, transactions: [] });

    const reference = uuidv4();

    const transaction = {
      type: "Deposit",
      amount: Number(amount),
      status: "Pending",
      method: method.name,
      details: paymentDetails || {},
      note: "",
      reference,
    };

    switch (method.type) {
      case "card":
        transaction.note = "Processing card payment manually...";
        break;
      case "mobile-money":
      case "mpesa":
        transaction.note = `Send ${paymentDetails.network} payment to ${paymentDetails.phone}...`;
        break;
      case "bank":
        transaction.note = `Send bank transfer to: ${method.bankInfo || "Contact support"}`;
        break;
      default:
        transaction.note = "Deposit initiated manually.";
    }

    wallet.transactions.push(transaction);
    wallet.balance = calculateCompletedBalance(wallet.transactions);
    await wallet.save();

    await User.findByIdAndUpdate(req.user.id, { balance: wallet.balance });

    req.app.get("io").emit("wallet:update", {
      userId: req.user.id,
      balance: wallet.balance,
      transactions: wallet.transactions,
    });

    res.status(201).json({
      message: "Manual deposit initiated. Awaiting admin confirmation.",
      wallet: { ...wallet.toObject(), balance: wallet.balance },
      reference,
      instructions: transaction.note,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};
