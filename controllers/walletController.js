import Wallet from "../models/Wallet.js";
import User from "../models/User.js";
import PaymentMethod from "../models/PaymentMethod.js";

// ✅ Single source of truth
const calculateCompletedBalance = (transactions = []) => {
  return transactions
    .filter(t => t.status === "Completed")
    .reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
};

// ================= GET WALLET =================
export const getWallet = async (req, res) => {
  try {
    let wallet = await Wallet.findOne({ user: req.user.id });
    if (!wallet) return res.status(404).json({ message: "Wallet not found" });

    // Calculate balance from transactions (never rely on stored balance)
    const balance = calculateCompletedBalance(wallet.transactions);

    res.json({ ...wallet.toObject(), balance });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// ================= ADD FUNDS =================
export const addFunds = async (req, res) => {
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
      return res.status(400).json({ message: `Minimum deposit for this method is ${method.minDeposit}` });
    }

    if (["mobile-money", "mpesa"].includes(method.type)) {
      if (!paymentDetails?.phone || !paymentDetails?.network) {
        return res.status(400).json({ message: "Phone number and mobile money network are required" });
      }
      if (!paymentDetails.country) {
        return res.status(400).json({ message: "Country is required for mobile money" });
      }
    }

    let wallet = await Wallet.findOne({ user: req.user.id });
    if (!wallet) wallet = await Wallet.create({ user: req.user.id, transactions: [] });

    // Create transaction
    const transaction = {
      type: "Deposit",
      amount: Number(amount),
      status: "Completed", // Auto-approved
      method: method.name,
      details: paymentDetails || {},
      note: "",
    };

    switch (method.type) {
      case "card":
        transaction.note = "Processing card payment...";
        break;
      case "mobile-money":
      case "mpesa":
        transaction.note = `Processing ${paymentDetails.network} payment for ${paymentDetails.phone}...`;
        break;
      case "bank":
        transaction.note = `Send bank transfer to: ${method.bankInfo || "Contact support"}`;
        break;
      case "manual":
        transaction.note = "Manual deposit: please contact support.";
        break;
      default:
        transaction.note = "Deposit initiated.";
    }

    wallet.transactions.push(transaction);

    // 🔹 persist new balance in DB
    wallet.balance = calculateCompletedBalance(wallet.transactions);
    await wallet.save();

    // Sync to User
    await User.findByIdAndUpdate(req.user.id, { balance: wallet.balance });

    // 🔔 Emit CLEAN balance only
    req.app.get("io").emit("wallet:update", {
      userId: req.user.id,
      balance: wallet.balance,
      transactions: wallet.transactions,
    });

    res.status(201).json({
      message: method.type === "manual" ? "Manual deposit: please contact support." : "Deposit successful",
      wallet: { ...wallet.toObject(), balance: wallet.balance },
      instructions: transaction.note,
    });
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

    let wallet = await Wallet.findOne({ user: req.user.id });
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
    };

    wallet.transactions.push(transaction);

    // 🔹 persist new balance in DB
    wallet.balance = calculateCompletedBalance(wallet.transactions);
    await wallet.save();

    // 🔔 Emit CLEAN balance only
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

    wallets.forEach((wallet) => {
      const completed = wallet.transactions.filter(t => t.status === "Completed");
      
      // Money added
      const moneyIn = completed
        .filter(t => t.amount > 0)
        .reduce((acc, t) => acc + t.amount, 0);

      // Money used (negative transactions)
      const moneyOut = completed
        .filter(t => t.amount < 0)
        .reduce((acc, t) => acc + Math.abs(t.amount), 0);

      totalBalance += moneyIn - moneyOut; // current total balance
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