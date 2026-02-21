const axios = require("axios");
const crypto = require("crypto");
const Transaction = require("../models/Transaction");
const Wallet = require("../models/Wallet");


// ===============================
// 1️⃣ INITIALIZE PAYSTACK PAYMENT
// ===============================
exports.initializePaystack = async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: "Invalid amount" });
    }

    const user = req.user;

    // Convert to kobo
    const amountInKobo = amount * 100;

    const reference = `MP-${Date.now()}-${user._id}`;

    // Create pending transaction
    const transaction = await Transaction.create({
      user: user._id,
      reference,
      amount,
      status: "Pending",
      type: "Deposit"
    });

    // Initialize Paystack
    const response = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      {
        email: user.email,
        amount: amountInKobo,
        reference,
        callback_url: `${process.env.FRONTEND_URL}/payment/success`
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    return res.status(200).json({
      authorization_url: response.data.data.authorization_url
    });

  } catch (error) {
    console.error("Paystack Initialize Error:", error.response?.data || error.message);
    return res.status(500).json({ message: "Payment initialization failed" });
  }
};



// ===============================
// 2️⃣ PAYSTACK WEBHOOK HANDLER
// ===============================
exports.handlePaystackWebhook = async (req, res) => {
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

    const { reference, amount, status } = event.data;

    if (status !== "success") {
      return res.status(200).send("Payment not successful");
    }

    const transaction = await Transaction.findOne({ reference });

    if (!transaction) {
      return res.status(404).send("Transaction not found");
    }

    if (transaction.status === "Completed") {
      return res.status(200).send("Already processed");
    }

    // Verify transaction server-to-server
    const verify = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
        }
      }
    );

    if (
      verify.data.data.status !== "success" ||
      verify.data.data.amount !== transaction.amount * 100
    ) {
      return res.status(400).send("Verification failed");
    }

    // Update wallet
    const wallet = await Wallet.findOne({ user: transaction.user });

    wallet.balance += transaction.amount;
    await wallet.save();

    transaction.status = "Completed";
    await transaction.save();

    return res.status(200).send("Payment processed");

  } catch (error) {
    console.error("Webhook Error:", error.message);
    return res.status(500).send("Webhook processing failed");
  }
};
