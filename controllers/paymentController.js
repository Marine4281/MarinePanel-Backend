import axios from "axios";
import crypto from "crypto";
import Transaction from "../models/Transaction.js";
import Wallet from "../models/Wallet.js";

// ===============================
// INITIALIZE PAYSTACK
// ===============================

export const initializePaystack = async (req, res) => {
  try {
    const { amount, method, paymentDetails } = req.body;

    if (!amount || amount <= 0 || !method) {
      return res.status(400).json({ message: "Invalid amount or method" });
    }

    const user = req.user;

    // 🌍 Currency Handling
    let currency = "USD";
    let convertedAmount = amount;
    const USD_TO_KES_RATE = 130;

    if (method.toLowerCase().includes("mpesa")) {
      currency = "KES";
      convertedAmount = amount * USD_TO_KES_RATE;
    }

    const amountInSmallestUnit = Math.round(convertedAmount * 100);
    const reference = `MP-${Date.now()}-${user._id}`;

    // ✅ Save transaction (store extra info inside "details")
    await Transaction.create({
      user: user._id,
      reference,
      amount, // Always store USD
      status: "Pending",
      type: "Deposit",
      method,
      details: {
        currency,
        convertedAmount,
        paymentDetails,
      },
    });

    const response = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      {
        email: user.email,
        amount: amountInSmallestUnit,
        reference,
        currency,
        callback_url: `${process.env.FRONTEND_URL}/payment/success`,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    return res.status(200).json({
      authorization_url: response.data.data.authorization_url,
      reference,
      message: "Payment initialized successfully",
    });

  } catch (error) {
    console.error("Initialize Error:", error.response?.data || error.message);
    return res.status(500).json({ message: "Payment initialization failed" });
  }
};

// ===============================
// WEBHOOK HANDLER
// ===============================

export const handlePaystackWebhook = async (req, res) => {
  try {
    const hash = crypto
      .createHmac("sha512", process.env.PAYSTACK_SECRET_KEY)
      .update(JSON.stringify(req.body))
      .digest("hex");

    if (hash !== req.headers["x-paystack-signature"]) {
      return res.status(400).send("Invalid signature");
    }

    const event = req.body;
    if (event.event !== "charge.success") {
      return res.status(200).send("Event ignored");
    }

    const { reference } = event.data;

    const transaction = await Transaction.findOne({ reference });
    if (!transaction) return res.status(404).send("Transaction not found");
    if (transaction.status === "Completed") return res.status(200).send("Already processed");

    const verify = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        },
      }
    );

    if (verify.data.data.status !== "success") {
      return res.status(400).send("Verification failed");
    }

    // Ensure wallet exists
    let wallet = await Wallet.findOne({ user: transaction.user });
    if (!wallet) {
      wallet = await Wallet.create({
        user: transaction.user,
        balance: 0,
        transactions: [],
      });
    }

    // Credit wallet in USD
    wallet.transactions.push({
      type: "Deposit",
      amount: transaction.amount,
      status: "Completed",
      reference: transaction.reference,
      note: `${transaction.method} deposit`,
      details: event.data,
    });

    wallet.balance += transaction.amount;
    await wallet.save();

    transaction.status = "Completed";
    await transaction.save();

    req.app.get("io").emit("wallet:update", {
      userId: transaction.user,
      balance: wallet.balance,
      transactions: wallet.transactions,
    });

    return res.status(200).send("Payment processed");

  } catch (error) {
    console.error("Webhook Error:", error.message);
    return res.status(500).send("Webhook failed");
  }
};
