// controllers/paymentController.js

import axios from "axios";
import crypto from "crypto";
import Transaction from "../models/Transaction.js";
import Wallet from "../models/Wallet.js";
import PaymentMethod from "../models/PaymentMethod.js";
import User from "../models/User.js";
import Settings from "../models/Settings.js";
import { tryReactivateChildPanel } from "../utils/childPanelBilling.js";
import { onCpWalletCredited } from "../utils/onCpWalletCredited.js";

// ===============================
// CONFIG
// ===============================
const USD_TO_KES_RATE = 135; // 🔥 Change this anytime if rate changes

// ======================= HELPERS =======================

const calculateBalance = (transactions = []) =>
  transactions
    .filter((t) => t.status === "Completed")
    .reduce((acc, t) => acc + (Number(t.amount) || 0), 0);

// ===============================
// INITIALIZE PAYSTACK
// ===============================
// Works for both platform users and child panel users.
// When a child panel user deposits via platform gateway,
// we stamp childPanelOwner on the Transaction so the webhook
// knows to credit the child panel owner's wallet too.

export const initializePaystack = async (req, res) => {
  try {
    const { amount, method } = req.body;

    if (!amount || amount <= 0 || !method) {
      return res.status(400).json({ message: "Invalid amount or method" });
    }

    // Get method from DB
    const paymentMethod = await PaymentMethod.findOne({
      name: method,
      isVisible: true,
    });
    if (!paymentMethod) {
      return res.status(404).json({ message: "Payment method not found" });
    }

    // Minimum deposit enforcement
    if (Number(amount) < paymentMethod.minDeposit) {
      return res.status(400).json({
        message: `Minimum deposit for this method is ${paymentMethod.minDeposit} USD`,
      });
    }

    const user = req.user;
    const usdAmount = Number(amount);
    const kesAmount = usdAmount * USD_TO_KES_RATE;
    const amountInKobo = Math.round(kesAmount * 100);
    const reference = `MP-${Date.now()}-${user._id}`;

    // Resolve child panel owner if this user belongs to a child panel
    // that uses platform payment mode (i.e. this depositor is a
    // RESELLER/end-user of a child panel, not the CP owner themself)
    let childPanelOwner = null;

    if (user.childPanelOwner) {
      const cpOwner = await User.findById(user.childPanelOwner).select(
        "isChildPanel childPanelPaymentMode"
      );

      if (
        cpOwner &&
        cpOwner.isChildPanel &&
        cpOwner.childPanelPaymentMode === "platform"
      ) {
        childPanelOwner = cpOwner._id;
      }
    }

    await Transaction.create({
      user: user._id,
      reference,
      amount: usdAmount,
      status: "Pending",
      type: "Deposit",
      method: paymentMethod.name,
      childPanelOwner,       // null for platform users
      childPanelCredited: false,
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
// Handles Paystack charge.success events.
//
// Flow for platform users:
//   deposit → credit user wallet → done
//
// Flow for child panel users using platform gateway:
//   deposit → credit user wallet → credit child panel owner wallet
//   → check if that credit covers the CP owner's overdue subscription
//
// Flow for a child panel OWNER depositing into their own wallet:
//   deposit → credit user wallet → check if deposit + existing
//   balance now covers their own overdue subscription
//
// childPanelCredited flag prevents double-crediting if webhook
// fires more than once for the same reference.

export const handlePaystackWebhook = async (req, res) => {
  try {
    // Verify Paystack signature
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
    if (transaction.status === "Completed") {
      return res.status(200).send("Already processed");
    }

    // Verify with Paystack
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

    const io = req.app.get("io");

    // ======================= CREDIT USER WALLET =======================

    let wallet = await Wallet.findOne({ user: transaction.user });
    if (!wallet) {
      wallet = await Wallet.create({
        user: transaction.user,
        balance: 0,
        transactions: [],
      });
    }

    wallet.transactions.push({
      type: "Deposit",
      amount: transaction.amount,
      status: "Completed",
      reference: transaction.reference,
      note: "Paystack deposit (USD converted to KES)",
      details: event.data,
    });

    wallet.balance = calculateBalance(wallet.transactions);
    await wallet.save();
    await User.findByIdAndUpdate(transaction.user, { balance: wallet.balance });

    transaction.status = "Completed";
    await transaction.save();

    // Emit to user
    if (io) {
      io.emit("wallet:update", {
        userId: transaction.user,
        balance: wallet.balance,
        transactions: wallet.transactions,
      });
    }

    // ======================= CASE A: DEPOSITOR IS A CHILD PANEL OWNER =======================
    // The CP owner deposited into their own wallet. If their panel is
    // currently subscription-suspended, check whether this deposit
    // (combined with whatever was already in the wallet) now covers
    // the overdue fee — if so, deduct it and reopen the panel.

    try {
      const depositor = await User.findById(transaction.user);

      if (depositor && depositor.isChildPanel) {
        const { reactivated, newBalance, resumedResellers } = await onCpWalletCredited(depositor, io);
        
        if (reactivated && io) {
          io.emit("wallet:update", {
            userId: depositor._id,
            balance: newBalance,
          });
          io.to(String(depositor._id)).emit("childPanelReactivated", {
            message: "Your child panel subscription has been paid and reactivated.",
          });
        }
      }
    } catch (selfErr) {
      // Log but don't fail the webhook — user wallet is already
      // credited, reactivation can be retried via cron or manually.
      console.error("CP SELF-DEPOSIT REACTIVATION ERROR:", selfErr.message);
    }

    // ======================= CASE B: DEPOSITOR IS A CP OWNER'S RESELLER =======================
    // Only runs if:
    //   1. This deposit came from a reseller/end-user of a child panel
    //   2. That child panel uses platform payment mode
    //   3. It hasn't been credited already (idempotency guard)
    //
    // Credits the CP owner even if their panel is currently suspended —
    // suspension shouldn't block them from receiving deposit earnings,
    // and receiving funds is exactly what lets them pay off the fee.

    if (
      transaction.childPanelOwner &&
      !transaction.childPanelCredited
    ) {
      try {
        const cpOwner = await User.findById(transaction.childPanelOwner);

        if (
          cpOwner &&
          cpOwner.isChildPanel &&
          cpOwner.childPanelPaymentMode === "platform"
        ) {
          // Child panel owner's wallet
          let cpWallet = await Wallet.findOne({ user: cpOwner._id });
          if (!cpWallet) {
            cpWallet = await Wallet.create({
              user: cpOwner._id,
              balance: 0,
              transactions: [],
            });
          }

          cpWallet.transactions.push({
            type: "CP Deposit Earning",
            amount: transaction.amount,
            status: "Completed",
            reference: `CP-${transaction.reference}`,
            note: `User deposit via platform gateway (ref: ${transaction.reference})`,
            createdAt: new Date(),
          });

          cpWallet.balance = calculateBalance(cpWallet.transactions);
          await cpWallet.save();
          await User.findByIdAndUpdate(cpOwner._id, { balance: cpWallet.balance });

          // Mark as credited — prevents double credit on webhook retry
          transaction.childPanelCredited = true;
          await transaction.save();

          // Check whether this credit reactivates a suspended panel
          // and/or resumes any resellers on hold for the platform fee.
          const { reactivated, newBalance, resumedResellers } = await onCpWalletCredited(cpOwner, io);
          
          // Emit to child panel owner
          if (io) {
            io.emit("wallet:update", {
              userId: cpOwner._id,
              balance: newBalance,
            });
            if (reactivated) {
              io.to(String(cpOwner._id)).emit("childPanelReactivated", {
                message: "Your child panel subscription has been reactivated.",
              });
            }
          }
        }
      } catch (cpErr) {
        // Log but don't fail the webhook response —
        // user wallet is already credited. CP wallet credit
        // can be retried manually if needed.
        console.error("CP WALLET CREDIT ERROR:", cpErr.message);
      }
    }

    return res.status(200).send("Payment processed");
  } catch (error) {
    console.error("Webhook Error:", error.message);
    return res.status(500).send("Webhook failed");
  }
};
