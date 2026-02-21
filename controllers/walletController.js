import Wallet from "../models/Wallet.js";
import User from "../models/User.js";
import PaymentMethod from "../models/PaymentMethod.js";

// ✅ Calculate completed transactions
const calculateCompletedBalance = (transactions = []) =>
  transactions
    .filter(t => t.status === "Completed")
    .reduce((acc, t) => acc + Number(t.amount || 0), 0);

    

    // Customize note based on payment method
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
      default:
        transaction.note = "Deposit initiated.";
    }

    wallet.transactions.push(transaction);

    // Persist balance (counts only Completed transactions)
    wallet.balance = calculateCompletedBalance(wallet.transactions);
    await wallet.save();

    // Update User balance
    await User.findByIdAndUpdate(req.user.id, { balance: wallet.balance });

    // Emit socket update
    req.app.get("io").emit("wallet:update", {
      userId: req.user.id,
      balance: wallet.balance,
      transactions: wallet.transactions,
    });

    res.status(201).json({
      message: "Deposit initiated. Awaiting confirmation.",
      wallet: { ...wallet.toObject(), balance: wallet.balance },
      reference, // frontend can track payment status with this
      instructions: transaction.note,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};
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

    res.json({
      ...wallet.toObject(),
      balance,
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
