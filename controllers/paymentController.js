import axios from "axios";
import crypto from "crypto";
import Transaction from "../models/Transaction.js";
import Wallet from "../models/Wallet.js";
import PaymentMethod from "../models/PaymentMethod.js";

// ===============================
// CONFIG
// ===============================
const USD_TO_KES_RATE = 130; // 🔥 Change this anytime if rate changes

// ===============================
// INITIALIZE PAYSTACK
// ===============================

export const initializePaystack = async (req, res) => {
  try {
    const { amount, method } = req.body;

    if (!amount || amount <= 0 || !methodId) {
      return res.status(400).json({ message: "Invalid amount or method" });
    }

    // 🔥 Get method from DB
    const method = await PaymentMethod.findById(method);
    if (!method || !method.isVisible) {
      return res.status(404).json({ message: "Payment method not found" });
    }

    // 🔒 Minimum deposit enforcement
    if (Number(amount) < method.minDeposit) {
      return res.status(400).json({
        message: `Minimum deposit for this method is ${method.minDeposit} USD`,
      });
    }

    const user = req.user;
    const usdAmount = Number(amount);

    const kesAmount = usdAmount * USD_TO_KES_RATE;
    const amountInKobo = Math.round(kesAmount * 100);

    const reference = `MP-${Date.now()}-${user._id}`;

    await Transaction.create({
      user: user._id,
      reference,
      amount: usdAmount,
      status: "Pending",
      type: "Deposit",
      method: method.name,
    });

    const response = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      {
        email: user.email,
        amount: amountInKobo,
        currency: "KES",
        reference,
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

    const { reference, amount } = event.data;

    const transaction = await Transaction.findOne({ reference });
    if (!transaction) return res.status(404).send("Transaction not found");
    if (transaction.status === "Completed") {
      return res.status(200).send("Already processed");
    }

    // 🔍 Verify with Paystack
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

    // ✅ Ensure wallet exists
    let wallet = await Wallet.findOne({ user: transaction.user });
    if (!wallet) {
      wallet = await Wallet.create({
        user: transaction.user,
        balance: 0,
        transactions: [],
      });
    }

    // 💰 Credit USD (original amount user entered)
    wallet.balance += transaction.amount;

    wallet.transactions.push({
      type: "Deposit",
      amount: transaction.amount,
      status: "Completed",
      reference: transaction.reference,
      note: "Paystack deposit (USD converted to KES)",
      details: event.data,
    });

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
