// controllers/withdrawalController.js
import crypto from "crypto";
import PaymentGateway from "../models/PaymentGateway.js";
import Transaction     from "../models/Transaction.js";
import Wallet          from "../models/Wallet.js";
import User             from "../models/User.js";
import { getGateway } from "../utils/gateways/index.js";
import { decryptCredentials } from "../utils/encryptCredentials.js";
import { calculateFee } from "../utils/calculateFee.js";
import { calcBalance, safeGateway, getAvailableBalance } from "../utils/gatewayHelpers.js";

// ─── USER: GET WITHDRAW GATEWAYS ─────────────────────────────────────
export const getUserWithdrawGateways = async (req, res) => {
  try {
    const user = req.user;
    const ownerFilter = user.childPanelOwner || null;

    const gateways = await PaymentGateway.find({
      owner:            ownerFilter,
      isActive:         true,
      isVisible:        true,
      adminHidden:      false,
      supportsWithdraw: true,
    }).populate("providerProfile", "providerType name");

    res.json({ gateways: gateways.map(safeGateway) });
  } catch (err) {
    console.error("getUserWithdrawGateways error:", err);
    res.status(500).json({ message: "Failed to fetch withdraw gateways" });
  }
};

// ─── USER: GET WITHDRAW QUOTE ────────────────────────────────────────
export const getWithdrawQuote = async (req, res) => {
  try {
    const { gatewayId, usdAmount } = req.query;
    if (!gatewayId || !usdAmount) {
      return res.status(400).json({ message: "gatewayId and usdAmount required" });
    }

    const gw = await PaymentGateway.findById(gatewayId);
    if (!gw || !gw.isActive || !gw.isVisible || gw.adminHidden || !gw.supportsWithdraw) {
      return res.status(404).json({ message: "Gateway not found" });
    }

    const usd       = Number(usdAmount);
    const localBase = Math.round(usd * gw.exchangeRate * 100) / 100;
    const { fee }   = calculateFee(localBase, gw.feeType, gw.feePercentage, gw.feeFixed);
    const amountReceived = Math.round((localBase - fee) * 100) / 100;

    res.json({
      usdAmount:                usd,
      processingCurrency:       gw.processingCurrency,
      processingCurrencySymbol: gw.processingCurrencySymbol,
      exchangeRate:             gw.exchangeRate,
      fee,
      amountReceived,
      walletDebit: usd,
      adminNote:   gw.adminNote || "",
      cpNote:      gw.cpNote    || "",
    });
  } catch (err) {
    console.error("getWithdrawQuote error:", err);
    res.status(500).json({ message: "Failed to calculate quote" });
  }
};

// ─── USER: INITIALIZE WITHDRAWAL ─────────────────────────────────────
export const initializeWithdrawal = async (req, res) => {
  try {
    const { gatewayId, usdAmount, userPayoutData = {} } = req.body;
    const user = req.user;

    if (!gatewayId || !usdAmount || usdAmount <= 0) {
      return res.status(400).json({ message: "Invalid request" });
    }

    const gw = await PaymentGateway.findById(gatewayId).populate("providerProfile");
    if (!gw || !gw.isActive || !gw.isVisible || gw.adminHidden || !gw.supportsWithdraw) {
      return res.status(404).json({ message: "Gateway not found" });
    }

    // CP end users can only withdraw via a gateway their own CP owner set up.
    // (getUserWithdrawGateways already filters this on the list, but a user
    // could still POST an arbitrary gatewayId directly — guard it here too.)
    const expectedOwner = (user.childPanelOwner || null)?.toString() || null;
    const actualOwner   = (gw.owner || null)?.toString() || null;
    if (expectedOwner !== actualOwner) {
      return res.status(403).json({ message: "This withdrawal method is not available to you" });
    }

    const usd = Number(usdAmount);
    if (usd < gw.minWithdraw) {
      return res.status(400).json({ message: `Minimum withdrawal is $${gw.minWithdraw} USD` });
    }

    const { wallet, available } = await getAvailableBalance(user._id);
    if (!wallet || usd > available) {
      return res.status(400).json({ message: "Insufficient available balance" });
    }

    const reference = `WD-${Date.now()}-${user._id}`;
    const localBase = Math.round(usd * gw.exchangeRate * 100) / 100;
    const { fee }    = calculateFee(localBase, gw.feeType, gw.feePercentage, gw.feeFixed);
    const amountReceived = Math.round((localBase - fee) * 100) / 100;

    await Transaction.create({
      user:            user._id,
      reference,
      amount:          -usd,
      localAmount:     amountReceived,
      localCurrency:   gw.processingCurrency,
      status:          "Pending",
      type:            "Withdrawal",
      method:          gw.name,
      gateway:         gw._id,
      provider:        gw.paymentMode === "manual" ? "manual" : (gw.providerProfile?.providerType || "manual"),
      childPanelOwner: user.childPanelOwner || null, // routes this to the CP owner's review queue, not the platform's
      details:         userPayoutData,
    });

    // Lock the funds — pushed as Pending so calcBalance (Completed-only) leaves
    // the visible balance untouched, but getAvailableBalance() excludes it.
    wallet.transactions.push({
      type:      "Withdrawal",
      amount:    -usd,
      status:    "Pending",
      reference,
      note:      `${gw.name} withdrawal request`,
    });
    await wallet.save();

    // Manual gateway, or no provider configured — admin (platform or CP owner) pays out by hand
    if (gw.paymentMode === "manual" || !gw.providerProfile) {
      return res.json({ message: "Withdrawal requested. Pending admin review." });
    }

    const adapter = getGateway(gw.providerProfile.providerType);
    if (!adapter || !adapter.payout) {
      return res.json({ message: "Withdrawal requested. Pending admin review." });
    }

    // Automatic gateway — attempt payout now
    try {
      const credentials = decryptCredentials(gw.providerProfile.credentials);
      const result = await adapter.payout(credentials, {
        amount:    amountReceived,
        currency:  gw.processingCurrency,
        reference,
        recipient: userPayoutData,
      });

      if (result.status === "completed") {
        await completeWithdrawal(reference, req.app.get("io"));
        return res.json({ message: "Withdrawal completed", providerReference: result.providerReference });
      }

      return res.json({ message: "Withdrawal is processing", providerReference: result.providerReference });
    } catch (err) {
      console.error("payout error:", err.response?.data || err.message);
      await failWithdrawal(reference, req.app.get("io"));
      return res.status(502).json({ message: "Payout failed. Funds have not been deducted." });
    }
  } catch (err) {
    console.error("initializeWithdrawal error:", err.message);
    res.status(500).json({ message: "Withdrawal initialization failed" });
  }
};

// ─── SHARED: COMPLETE WITHDRAWAL (deduct wallet for real) ────────────
const completeWithdrawal = async (reference, io) => {
  const transaction = await Transaction.findOne({ reference });
  if (!transaction || transaction.status === "Completed") return;

  const wallet = await Wallet.findOne({ user: transaction.user });
  if (!wallet) return;

  const walletTx = wallet.transactions.find((t) => t.reference === reference);
  if (walletTx) walletTx.status = "Completed";

  wallet.balance = calcBalance(wallet.transactions);
  await wallet.save();

  transaction.status = "Completed";
  await transaction.save();

  if (io) io.emit("wallet:update", { userId: transaction.user, balance: wallet.balance });
};

// ─── SHARED: FAIL WITHDRAWAL (release the lock, no funds moved) ──────
const failWithdrawal = async (reference, io) => {
  const transaction = await Transaction.findOne({ reference });
  if (!transaction || transaction.status === "Completed") return;

  transaction.status = "Failed";
  await transaction.save();

  const wallet = await Wallet.findOne({ user: transaction.user });
  if (wallet) {
    const walletTx = wallet.transactions.find((t) => t.reference === reference);
    if (walletTx) walletTx.status = "Failed";
    await wallet.save();
  }

  if (io) io.emit("wallet:update", { userId: transaction.user });
};

// ─── ADMIN (PLATFORM): APPROVE MANUAL WITHDRAWAL ──────────────────────
export const adminApproveWithdrawal = async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id);
    if (!transaction || transaction.type !== "Withdrawal") {
      return res.status(404).json({ message: "Withdrawal not found" });
    }
    if (transaction.status !== "Pending") {
      return res.status(400).json({ message: "Withdrawal is not pending" });
    }
    if (transaction.childPanelOwner) {
      return res.status(403).json({ message: "This withdrawal belongs to a child panel — it must be reviewed by that panel's owner" });
    }

    await completeWithdrawal(transaction.reference, req.app.get("io"));
    res.json({ message: "Withdrawal approved and wallet debited" });
  } catch (err) {
    console.error("adminApproveWithdrawal error:", err.message);
    res.status(500).json({ message: "Failed to approve withdrawal" });
  }
};

// ─── ADMIN (PLATFORM): REJECT WITHDRAWAL (releases held funds) ────────
export const adminRejectWithdrawal = async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id);
    if (!transaction || transaction.type !== "Withdrawal") {
      return res.status(404).json({ message: "Withdrawal not found" });
    }
    if (transaction.status !== "Pending") {
      return res.status(400).json({ message: "Withdrawal is not pending" });
    }
    if (transaction.childPanelOwner) {
      return res.status(403).json({ message: "This withdrawal belongs to a child panel — it must be reviewed by that panel's owner" });
    }

    await failWithdrawal(transaction.reference, req.app.get("io"));
    res.json({ message: "Withdrawal rejected" });
  } catch (err) {
    res.status(500).json({ message: "Failed to reject withdrawal" });
  }
};

// ─── ADMIN (PLATFORM): GET PENDING WITHDRAWALS ────────────────────────
// Platform-only queue — excludes anything belonging to a child panel's end users.
export const adminGetPendingWithdrawals = async (req, res) => {
  try {
    const pending = await Transaction.find({
      status:          "Pending",
      type:            "Withdrawal",
      childPanelOwner: null,
    })
      .populate("user", "email")
      .populate("gateway", "name paymentMode")
      .sort({ createdAt: -1 });

    res.json({ withdrawals: pending });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch pending withdrawals" });
  }
};

// ─── CP OWNER: GET PENDING WITHDRAWALS (their own end users only) ────
export const cpGetPendingWithdrawals = async (req, res) => {
  try {
    const pending = await Transaction.find({
      status:          "Pending",
      type:            "Withdrawal",
      childPanelOwner: req.user._id,
    })
      .populate("user", "email")
      .populate("gateway", "name paymentMode")
      .sort({ createdAt: -1 });

    res.json({ withdrawals: pending });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch pending withdrawals" });
  }
};

// ─── CP OWNER: APPROVE WITHDRAWAL (their own end users only) ─────────
export const cpApproveWithdrawal = async (req, res) => {
  try {
    const transaction = await Transaction.findOne({
      _id:             req.params.id,
      type:            "Withdrawal",
      childPanelOwner: req.user._id,
    });
    if (!transaction) return res.status(404).json({ message: "Withdrawal not found" });
    if (transaction.status !== "Pending") {
      return res.status(400).json({ message: "Withdrawal is not pending" });
    }

    await completeWithdrawal(transaction.reference, req.app.get("io"));
    res.json({ message: "Withdrawal approved and wallet debited" });
  } catch (err) {
    console.error("cpApproveWithdrawal error:", err.message);
    res.status(500).json({ message: "Failed to approve withdrawal" });
  }
};

// ─── CP OWNER: REJECT WITHDRAWAL (their own end users only) ──────────
export const cpRejectWithdrawal = async (req, res) => {
  try {
    const transaction = await Transaction.findOne({
      _id:             req.params.id,
      type:            "Withdrawal",
      childPanelOwner: req.user._id,
    });
    if (!transaction) return res.status(404).json({ message: "Withdrawal not found" });
    if (transaction.status !== "Pending") {
      return res.status(400).json({ message: "Withdrawal is not pending" });
    }

    await failWithdrawal(transaction.reference, req.app.get("io"));
    res.json({ message: "Withdrawal rejected" });
  } catch (err) {
    res.status(500).json({ message: "Failed to reject withdrawal" });
  }
};

// ─── WEBHOOK: PAYOUT CONFIRMATION ─────────────────────────────────────
// Separate from the deposit webhook since payout payload shapes differ per provider.
export const handlePayoutWebhook = async (req, res) => {
  try {
    const { provider, token } = req.params;
    const gw = await PaymentGateway.findOne({ webhookToken: token }).populate("providerProfile");
    if (!gw) return res.status(404).send("Gateway not found");

    const credentials = decryptCredentials(gw.providerProfile?.credentials || {});

    // ── M-PESA B2C RESULT CALLBACK ──────────────────────────────────
    if (provider === "mpesa") {
      const result = req.body?.Result;
      const txn = await Transaction.findOne({ type: "Withdrawal", status: "Pending", gateway: gw._id })
        .sort({ createdAt: -1 });
      if (!txn) return res.status(404).send("Transaction not found");

      if (result?.ResultCode === 0) await completeWithdrawal(txn.reference, req.app.get("io"));
      else await failWithdrawal(txn.reference, req.app.get("io"));
      return res.status(200).send("OK");
    }

    // ── FLUTTERWAVE TRANSFER WEBHOOK ────────────────────────────────
    if (provider === "flutterwave") {
      if (req.headers["verif-hash"] !== credentials.webhookSecret) {
        return res.status(400).send("Invalid signature");
      }
      const data = req.body?.data;
      const txn = await Transaction.findOne({ reference: data?.reference, type: "Withdrawal" });
      if (!txn) return res.status(404).send("Transaction not found");

      if (data?.status === "SUCCESSFUL") await completeWithdrawal(txn.reference, req.app.get("io"));
      else if (data?.status === "FAILED") await failWithdrawal(txn.reference, req.app.get("io"));
      return res.status(200).send("OK");
    }

    // ── KORA DISBURSEMENT WEBHOOK ───────────────────────────────────
    if (provider === "kora") {
      const hash = crypto
        .createHmac("sha256", credentials.secretKey)
        .update(JSON.stringify(req.body))
        .digest("hex");
      if (hash !== req.headers["x-korapay-signature"]) {
        return res.status(400).send("Invalid signature");
      }

      const data = req.body?.data;
      const txn = await Transaction.findOne({ reference: data?.reference, type: "Withdrawal" });
      if (!txn) return res.status(404).send("Transaction not found");

      if (data?.status === "success") await completeWithdrawal(txn.reference, req.app.get("io"));
      else if (data?.status === "failed") await failWithdrawal(txn.reference, req.app.get("io"));
      return res.status(200).send("OK");
    }

    // ── PAYSTACK TRANSFER WEBHOOK ───────────────────────────────────
    if (provider === "paystack") {
      const hash = crypto
        .createHmac("sha512", credentials.secretKey)
        .update(JSON.stringify(req.body))
        .digest("hex");
      if (hash !== req.headers["x-paystack-signature"]) {
        return res.status(400).send("Invalid signature");
      }

      const event = req.body?.event; // transfer.success | transfer.failed | transfer.reversed
      const data  = req.body?.data;
      const txn = await Transaction.findOne({ reference: data?.reference, type: "Withdrawal" });
      if (!txn) return res.status(404).send("Transaction not found");

      if (event === "transfer.success") await completeWithdrawal(txn.reference, req.app.get("io"));
      else if (event === "transfer.failed" || event === "transfer.reversed") {
        await failWithdrawal(txn.reference, req.app.get("io"));
      }
      return res.status(200).send("OK");
    }

    // ── CRYPTOMUS PAYOUT WEBHOOK ────────────────────────────────────
    if (provider === "cryptomus") {
      const payoutKey = credentials.payoutApiKey || credentials.apiKey;
      const received   = req.body?.sign;
      if (!received) return res.status(400).send("Missing signature");

      const payload = { ...req.body };
      delete payload.sign;
      const base64   = Buffer.from(JSON.stringify(payload)).toString("base64");
      const expected = crypto.createHash("md5").update(base64 + payoutKey).digest("hex");
      if (expected !== received) return res.status(400).send("Invalid signature");

      const txn = await Transaction.findOne({ reference: req.body?.order_id, type: "Withdrawal" });
      if (!txn) return res.status(404).send("Transaction not found");

      const status = req.body?.status;
      if (status === "paid") await completeWithdrawal(txn.reference, req.app.get("io"));
      else if (["fail", "cancel", "system_fail"].includes(status)) {
        await failWithdrawal(txn.reference, req.app.get("io"));
      }
      return res.status(200).send("OK");
    }

    res.status(400).send("Unsupported provider for payout webhook");
  } catch (err) {
    console.error("Payout webhook error:", err.message);
    res.status(500).send("Webhook failed");
  }
};
