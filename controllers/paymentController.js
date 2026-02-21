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

    // -----------------------------
    // 🌍 Currency Handling
    // -----------------------------
    let currency = "USD"; // default
    let convertedAmount = amount; // amount in original currency
    const USD_TO_KES_RATE = 130; // 🔁 Change this if needed

    // If using M-Pesa → convert USD to KES
    if (method.toLowerCase().includes("mpesa")) {
      currency = "KES";
      convertedAmount = amount * USD_TO_KES_RATE;
    }

    // Paystack requires smallest currency unit
    const amountInSmallestUnit = Math.round(convertedAmount * 100);

    const reference = `MP-${Date.now()}-${user._id}`;

    // -----------------------------
    // Save transaction (always store USD in your DB)
    // -----------------------------
    await Transaction.create({
      user: user._id,
      reference,
      amount, // store USD value
      status: "Pending",
      type: "Deposit",
      method,
      paymentDetails,
      currency, // store payment currency
      convertedAmount, // store converted value (KES if mpesa)
    });

    // -----------------------------
    // Initialize Paystack
    // -----------------------------
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

    // -----------------------------
    // Verify transaction with Paystack
    // -----------------------------
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

    // -----------------------------
    // Ensure wallet exists
    // -----------------------------
    let wallet = await Wallet.findOne({ user: transaction.user });
    if (!wallet) {
      wallet = await Wallet.create({
        user: transaction.user,
        balance: 0,
        transactions: [],
      });
    }

    // -----------------------------
    // Credit wallet using ORIGINAL USD amount
    // -----------------------------
    wallet.transactions.push({
      type: "Deposit",
      amount: transaction.amount, // credit USD
      status: "Completed",
      reference: transaction.reference,
      note: `${transaction.method} deposit`,
      details: event.data,
    });

    wallet.balance += transaction.amount; // add USD amount
    await wallet.save();

    // Update transaction status
    transaction.status = "Completed";
    await transaction.save();

    // Emit real-time update
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
