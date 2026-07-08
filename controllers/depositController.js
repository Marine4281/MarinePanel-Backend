// controllers/depositController.js
import PaymentGateway from "../models/PaymentGateway.js";
import Transaction     from "../models/Transaction.js";
import Wallet          from "../models/Wallet.js";
import User             from "../models/User.js";
import { getGateway } from "../utils/gateways/index.js";
import { decryptCredentials } from "../utils/encryptCredentials.js";
import { calculateFee } from "../utils/calculateFee.js";
import { calcBalance, safeGateway } from "../utils/gatewayHelpers.js";

// ─── PUBLIC: GET QUOTE ───────────────────────────────────────────────
export const getQuote = async (req, res) => {
  try {
    const { gatewayId, usdAmount } = req.query;
    if (!gatewayId || !usdAmount) {
      return res.status(400).json({ message: "gatewayId and usdAmount required" });
    }

    const gw = await PaymentGateway.findById(gatewayId);
    if (!gw || !gw.isActive || !gw.isVisible || gw.adminHidden) {
      return res.status(404).json({ message: "Gateway not found" });
    }

    const usd       = Number(usdAmount);
    const localBase = Math.round(usd * gw.exchangeRate * 100) / 100;
    const { depositAmount, fee, total } = calculateFee(
      localBase, gw.feeType, gw.feePercentage, gw.feeFixed
    );

    res.json({
      usdAmount:                usd,
      processingCurrency:       gw.processingCurrency,
      processingCurrencySymbol: gw.processingCurrencySymbol,
      exchangeRate:             gw.exchangeRate,
      depositAmount,
      fee,
      total,
      walletCredit: usd,
      adminNote:    gw.adminNote || "",
      cpNote:       gw.cpNote   || "",
    });
  } catch (err) {
    console.error("getQuote error:", err);
    res.status(500).json({ message: "Failed to calculate quote" });
  }
};

// ─── USER: GET VISIBLE GATEWAYS ──────────────────────────────────────
export const getUserGateways = async (req, res) => {
  try {
    const user = req.user;
    let ownerFilter = null;

    if (user.childPanelOwner) {
      ownerFilter = user.childPanelOwner;
    }

    const gateways = await PaymentGateway.find({
      owner:       ownerFilter,
      isActive:    true,
      isVisible:   true,
      adminHidden: false,
    }).populate("providerProfile", "providerType name");

    res.json({ gateways: gateways.map(safeGateway) });
  } catch (err) {
    console.error("getUserGateways error:", err);
    res.status(500).json({ message: "Failed to fetch gateways" });
  }
};

// ─── USER: INITIALIZE PAYMENT ────────────────────────────────────────
export const initializePayment = async (req, res) => {
  try {
    const { gatewayId, usdAmount, userPaymentData = {} } = req.body;
    const user = req.user;

    if (!gatewayId || !usdAmount || usdAmount <= 0) {
      return res.status(400).json({ message: "Invalid request" });
    }

    const gw = await PaymentGateway.findById(gatewayId)
      .populate("providerProfile");

    if (!gw || !gw.isActive || !gw.isVisible || gw.adminHidden) {
      return res.status(404).json({ message: "Gateway not found" });
    }

    const usd = Number(usdAmount);

    if (usd < gw.minDeposit) {
      return res.status(400).json({
        message: `Minimum deposit is $${gw.minDeposit} USD`,
      });
    }

    // Binance manual — save pending, admin verifies
    if (gw.paymentMode === "binance") {
      const reference = `BNB-${Date.now()}-${user._id}`;
      await Transaction.create({
        user:           user._id,
        reference,
        amount:         usd,
        localAmount:    usd,
        localCurrency:  "USDT",
        status:         "Pending",
        type:           "Deposit",
        method:         gw.name,
        gateway:        gw._id,
        provider:       "binance",
        details:        {
          binanceOrderId: userPaymentData.binanceOrderId || "",
          amountSent:     userPaymentData.amountSent     || "",
        },
      });
      return res.json({ message: "Deposit submitted. Pending verification." });
    }

    // Manual — save pending
    if (gw.paymentMode === "manual") {
      const reference = `MAN-${Date.now()}-${user._id}`;
      await Transaction.create({
        user:          user._id,
        reference,
        amount:        usd,
        localAmount:   usd,
        localCurrency: gw.processingCurrency,
        status:        "Pending",
        type:          "Deposit",
        method:        gw.name,
        gateway:       gw._id,
        provider:      "manual",
        details:       userPaymentData,
      });
      return res.json({ message: "Deposit submitted. Pending verification." });
    }

    // All other modes — use provider adapter
    if (!gw.providerProfile) {
      return res.status(400).json({ message: "No provider configured for this gateway" });
    }

    const adapter = getGateway(gw.providerProfile.providerType);
    if (!adapter) {
      return res.status(400).json({ message: "Unsupported provider" });
    }

    const credentials = decryptCredentials(gw.providerProfile.credentials);
    const localBase   = Math.round(usd * gw.exchangeRate * 100) / 100;
    const { total }   = calculateFee(localBase, gw.feeType, gw.feePercentage, gw.feeFixed);
    const reference   = `MP-${Date.now()}-${user._id}`;
    const callbackUrl = `${process.env.FRONTEND_URL}/payment/success`;

    // Resolve child panel owner
    let childPanelOwner = null;
    if (user.childPanelOwner) {
      const cp = await User.findById(user.childPanelOwner).select(
        "isChildPanel childPanelIsActive"
      );
      if (cp?.isChildPanel && cp?.childPanelIsActive) {
        childPanelOwner = cp._id;
      }
    }

    await Transaction.create({
      user:               user._id,
      reference,
      amount:             usd,
      localAmount:        total,
      localCurrency:      gw.processingCurrency,
      status:             "Pending",
      type:               "Deposit",
      method:             gw.name,
      gateway:            gw._id,
      provider:           gw.providerProfile.providerType,
      childPanelOwner,
      childPanelCredited: false,
      details:            userPaymentData,
    });

    const result = await adapter.initialize(credentials, {
      amount:          total,
      currency:        gw.processingCurrency,
      email:           user.email,
      reference,
      callbackUrl,
      userPaymentData, // passed to adapter for mpesa phone etc
    });

    res.json(result);
  } catch (err) {
    console.error("initializePayment error:", err.response?.data || err.message);
    res.status(500).json({ message: "Payment initialization failed" });
  }
};

// ─── WEBHOOK ─────────────────────────────────────────────────────────
export const handleWebhook = async (req, res) => {
  try {
    const { provider, token } = req.params;

    const gw = await PaymentGateway.findOne({ webhookToken: token })
      .populate("providerProfile");
    if (!gw) return res.status(404).send("Gateway not found");

    const adapter = getGateway(provider);
    if (!adapter) return res.status(400).send("Unsupported provider");

    const credentials = decryptCredentials(gw.providerProfile?.credentials || {});

    const isValid = adapter.verifyWebhook(credentials, req);
    if (!isValid) return res.status(400).send("Invalid signature");

    const reference = adapter.extractReference(req.body);
    if (!reference) return res.status(400).send("No reference");

    const transaction = await Transaction.findOne({ reference });
    if (!transaction) return res.status(404).send("Transaction not found");
    if (transaction.status === "Completed") return res.status(200).send("Already processed");

    const verified = await adapter.verify(credentials, reference);
    if (!verified) return res.status(400).send("Verification failed");

    await creditWallet(transaction, gw, req.app.get("io"));

    res.status(200).send("OK");
  } catch (err) {
    console.error("Webhook error:", err.message);
    res.status(500).send("Webhook failed");
  }
};

// ─── SHARED WALLET CREDIT ────────────────────────────────────────────
const creditWallet = async (transaction, gw, io) => {
  let wallet = await Wallet.findOne({ user: transaction.user });
  if (!wallet) {
    wallet = await Wallet.create({ user: transaction.user, balance: 0, transactions: [] });
  }

  wallet.transactions.push({
    type:      "Deposit",
    amount:    transaction.amount,
    status:    "Completed",
    reference: transaction.reference,
    note:      `${gw?.name || "Gateway"} deposit`,
  });

  wallet.balance = calcBalance(wallet.transactions);
  await wallet.save();

  transaction.status = "Completed";
  await transaction.save();

  if (io) {
    io.emit("wallet:update", { userId: transaction.user, balance: wallet.balance });
  }

  // If this depositor is a child panel owner, retry any reseller
  // activations that were pending due to insufficient platform fee funds
  try {
    const depositor = await User.findById(transaction.user).select("isChildPanel").lean();
    if (depositor?.isChildPanel) {
      const { resolvePendingActivationsForCp } = await import("./resellerActivationResolver.js");
      await resolvePendingActivationsForCp(transaction.user, io);
    }
  } catch (err) {
    console.error("Pending reseller activation resolve error:", err.message);
  }

  // Credit child panel owner
  if (transaction.childPanelOwner && !transaction.childPanelCredited) {
    try {
      const cpOwner = await User.findById(transaction.childPanelOwner);
      if (cpOwner?.isChildPanel && cpOwner?.childPanelIsActive) {
        let cpWallet = await Wallet.findOne({ user: cpOwner._id });
        if (!cpWallet) {
          cpWallet = await Wallet.create({ user: cpOwner._id, balance: 0, transactions: [] });
        }
        cpWallet.transactions.push({
          type:      "CP Deposit Earning",
          amount:    transaction.amount,
          status:    "Completed",
          reference: `CP-${transaction.reference}`,
          note:      `User deposit via ${gw?.name || "gateway"}`,
        });
        cpWallet.balance = calcBalance(cpWallet.transactions);
        await cpWallet.save();
        transaction.childPanelCredited = true;
        await transaction.save();
        if (io) {
          io.emit("wallet:update", { userId: cpOwner._id, balance: cpWallet.balance });
        }
      }
    } catch (err) {
      console.error("CP credit error:", err.message);
    }
  }
};

// ─── ADMIN: APPROVE MANUAL/BINANCE DEPOSIT ───────────────────────────
export const adminApproveDeposit = async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id);
    if (!transaction) return res.status(404).json({ message: "Transaction not found" });
    if (transaction.status !== "Pending") {
      return res.status(400).json({ message: "Transaction is not pending" });
    }

    const gw = await PaymentGateway.findById(transaction.gateway);
    await creditWallet(transaction, gw, req.app.get("io"));

    res.json({ message: "Deposit approved and wallet credited" });
  } catch (err) {
    console.error("adminApproveDeposit error:", err.message);
    res.status(500).json({ message: "Failed to approve deposit" });
  }
};

// ─── ADMIN: REJECT MANUAL/BINANCE DEPOSIT ────────────────────────────
export const adminRejectDeposit = async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id);
    if (!transaction) return res.status(404).json({ message: "Transaction not found" });
    if (transaction.status !== "Pending") {
      return res.status(400).json({ message: "Transaction is not pending" });
    }

    transaction.status = "Failed";
    await transaction.save();

    const io = req.app.get("io");
    if (io) {
      io.emit("wallet:update", { userId: transaction.user });
    }

    res.json({ message: "Deposit rejected" });
  } catch (err) {
    res.status(500).json({ message: "Failed to reject deposit" });
  }
};

// ─── ADMIN: GET PENDING MANUAL DEPOSITS ──────────────────────────────
export const adminGetPendingDeposits = async (req, res) => {
  try {
    const pending = await Transaction.find({
      status:  "Pending",
      type:    "Deposit",
      provider: { $in: ["binance", "manual"] },
    })
      .populate("user", "email")
      .populate("gateway", "name paymentMode")
      .sort({ createdAt: -1 });

    res.json({ deposits: pending });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch pending deposits" });
  }
};
