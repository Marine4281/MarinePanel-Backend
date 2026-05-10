// controllers/paymentGatewayController.js
import crypto from "crypto";
import PaymentGateway from "../models/PaymentGateway.js";
import Transaction    from "../models/Transaction.js";
import Wallet         from "../models/Wallet.js";
import User           from "../models/User.js";
import { getGateway, getProvidersMeta } from "../utils/gateways/index.js";
import { encryptCredentials, decryptCredentials } from "../utils/encryptCredentials.js";
import { calculateFee } from "../utils/calculateFee.js";

const calcBalance = (transactions = []) =>
  transactions
    .filter((t) => t.status === "Completed")
    .reduce((acc, t) => acc + (Number(t.amount) || 0), 0);

// ─── HELPERS ─────────────────────────────────────────────────────────

const safeGateway = (gw) => ({
  _id:                     gw._id,
  provider:                gw.provider,
  label:                   gw.label,
  processingCurrency:      gw.processingCurrency,
  processingCurrencySymbol:gw.processingCurrencySymbol,
  exchangeRate:            gw.exchangeRate,
  rateMode:                gw.rateMode,
  feeType:                 gw.feeType,
  feePercentage:           gw.feePercentage,
  feeFixed:                gw.feeFixed,
  adminNote:               gw.adminNote,
  cpNote:                  gw.cpNote,
  minDeposit:              gw.minDeposit,
  isActive:                gw.isActive,
  isVisible:               gw.isVisible,
  adminHidden:             gw.adminHidden,
  webhookToken:            gw.webhookToken,
  // credentials intentionally omitted — write-only after save
  hasCredentials: !!(gw.credentials?.secretKey || gw.credentials?.consumerKey),
  owner:          gw.owner,
  createdAt:      gw.createdAt,
});

// ─── PUBLIC: GET PROVIDERS META (drives dynamic frontend form) ───────
export const getProviders = (_req, res) => {
  res.json({ providers: getProvidersMeta() });
};

// ─── PUBLIC: GET QUOTE (user sees fee breakdown before paying) ───────
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

    const usd        = Number(usdAmount);
    const localBase  = Math.round(usd * gw.exchangeRate * 100) / 100;
    const { depositAmount, fee, total } = calculateFee(
      localBase, gw.feeType, gw.feePercentage, gw.feeFixed
    );

    res.json({
      usdAmount:               usd,
      processingCurrency:      gw.processingCurrency,
      processingCurrencySymbol:gw.processingCurrencySymbol,
      exchangeRate:            gw.exchangeRate,
      depositAmount,   // local currency before fee
      fee,             // processing fee in local currency
      total,           // what provider charges in local currency
      walletCredit:    usd, // always USD to wallet
      adminNote:       gw.adminNote || "",
      cpNote:          gw.cpNote   || "",
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

    let ownerFilter = null; // platform gateways by default

    if (user.childPanelOwner) {
      ownerFilter = user.childPanelOwner;
    }

    const gateways = await PaymentGateway.find({
      owner:       ownerFilter,
      isActive:    true,
      isVisible:   true,
      adminHidden: false,
    });

    res.json({ gateways: gateways.map(safeGateway) });
  } catch (err) {
    console.error("getUserGateways error:", err);
    res.status(500).json({ message: "Failed to fetch gateways" });
  }
};

// ─── USER: INITIALIZE PAYMENT ────────────────────────────────────────
export const initializePayment = async (req, res) => {
  try {
    const { gatewayId, usdAmount } = req.body;
    const user = req.user;

    if (!gatewayId || !usdAmount || usdAmount <= 0) {
      return res.status(400).json({ message: "Invalid request" });
    }

    const gw = await PaymentGateway.findById(gatewayId);
    if (!gw || !gw.isActive || !gw.isVisible || gw.adminHidden) {
      return res.status(404).json({ message: "Gateway not found" });
    }

    const usd = Number(usdAmount);

    if (usd < gw.minDeposit) {
      return res.status(400).json({
        message: `Minimum deposit is $${gw.minDeposit} USD`,
      });
    }

    const adapter = getGateway(gw.provider);
    if (!adapter) {
      return res.status(400).json({ message: "Unsupported provider" });
    }

    const credentials = decryptCredentials(gw.credentials);
    const localBase   = Math.round(usd * gw.exchangeRate * 100) / 100;
    const { total }   = calculateFee(localBase, gw.feeType, gw.feePercentage, gw.feeFixed);
    const reference   = `MP-${Date.now()}-${user._id}`;
    const callbackUrl = `${process.env.FRONTEND_URL}/payment/success`;

    // Resolve child panel owner
    let childPanelOwner = null;
    if (user.childPanelOwner) {
      const cpOwner = await User.findById(user.childPanelOwner).select(
        "isChildPanel childPanelIsActive childPanelPaymentMode"
      );
      if (cpOwner?.isChildPanel && cpOwner?.childPanelIsActive) {
        childPanelOwner = cpOwner._id;
      }
    }

    // Save pending transaction before hitting provider
    await Transaction.create({
      user:           user._id,
      reference,
      amount:         usd,             // USD — always credited to wallet
      localAmount:    total,           // what provider charges
      localCurrency:  gw.processingCurrency,
      status:         "Pending",
      type:           "Deposit",
      method:         gw.label,
      gateway:        gw._id,
      provider:       gw.provider,
      childPanelOwner,
      childPanelCredited: false,
    });

    const result = await adapter.initialize(credentials, {
      amount:      total,
      currency:    gw.processingCurrency,
      email:       user.email,
      reference,
      callbackUrl,
    });

    res.json(result);
  } catch (err) {
    console.error("initializePayment error:", err.response?.data || err.message);
    res.status(500).json({ message: "Payment initialization failed" });
  }
};

// ─── WEBHOOK (one route handles all providers) ───────────────────────
export const handleWebhook = async (req, res) => {
  try {
    const { provider, token } = req.params;

    const gw = await PaymentGateway.findOne({ webhookToken: token, provider });
    if (!gw) return res.status(404).send("Gateway not found");

    const adapter = getGateway(provider);
    if (!adapter) return res.status(400).send("Unsupported provider");

    const credentials = decryptCredentials(gw.credentials);

    // Verify webhook signature
    const isValid = adapter.verifyWebhook(credentials, req);
    if (!isValid) return res.status(400).send("Invalid signature");

    // Extract reference
    const reference = adapter.extractReference(req.body);
    if (!reference) return res.status(400).send("No reference");

    const transaction = await Transaction.findOne({ reference });
    if (!transaction) return res.status(404).send("Transaction not found");
    if (transaction.status === "Completed") return res.status(200).send("Already processed");

    // Verify with provider
    const verified = await adapter.verify(credentials, reference);
    if (!verified) return res.status(400).send("Verification failed");

    // Credit user wallet
    let wallet = await Wallet.findOne({ user: transaction.user });
    if (!wallet) {
      wallet = await Wallet.create({ user: transaction.user, balance: 0, transactions: [] });
    }

    wallet.transactions.push({
      type:      "Deposit",
      amount:    transaction.amount, // USD
      status:    "Completed",
      reference: transaction.reference,
      note:      `${gw.label} deposit`,
    });

    wallet.balance = calcBalance(wallet.transactions);
    await wallet.save();

    transaction.status = "Completed";
    await transaction.save();

    // Emit real-time update
    const io = req.app.get("io");
    if (io) {
      io.emit("wallet:update", { userId: transaction.user, balance: wallet.balance });
    }

    // Credit child panel owner wallet if applicable
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
            note:      `User deposit via ${gw.label}`,
            createdAt: new Date(),
          });
          cpWallet.balance = calcBalance(cpWallet.transactions);
          await cpWallet.save();

          transaction.childPanelCredited = true;
          await transaction.save();

          if (io) {
            io.emit("wallet:update", { userId: cpOwner._id, balance: cpWallet.balance });
          }
        }
      } catch (cpErr) {
        console.error("CP wallet credit error:", cpErr.message);
      }
    }

    res.status(200).send("OK");
  } catch (err) {
    console.error("Webhook error:", err.message);
    res.status(500).send("Webhook failed");
  }
};

// ─── CP OWNER: GET OWN GATEWAYS ──────────────────────────────────────
export const getCpGateways = async (req, res) => {
  try {
    const gateways = await PaymentGateway.find({ owner: req.user._id });
    res.json({ gateways: gateways.map(safeGateway) });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch gateways" });
  }
};

// ─── CP OWNER: CREATE GATEWAY ────────────────────────────────────────
export const createCpGateway = async (req, res) => {
  try {
    const {
      provider, label,
      processingCurrency, processingCurrencySymbol,
      exchangeRate, rateMode,
      feeType, feePercentage, feeFixed,
      minDeposit, cpNote,
      credentials: rawCredentials,
    } = req.body;

    if (!provider || !label) {
      return res.status(400).json({ message: "provider and label are required" });
    }

    if (!getGateway(provider)) {
      return res.status(400).json({ message: "Unsupported provider" });
    }

    const webhookToken = `wh_${crypto.randomBytes(24).toString("hex")}`;

    const gw = await PaymentGateway.create({
      owner:                   req.user._id,
      provider,
      label,
      processingCurrency:      processingCurrency || "USD",
      processingCurrencySymbol:processingCurrencySymbol || "$",
      exchangeRate:            exchangeRate || 1,
      rateMode:                rateMode || "manual",
      feeType:                 feeType || "none",
      feePercentage:           feePercentage || 0,
      feeFixed:                feeFixed || 0,
      minDeposit:              minDeposit || 0,
      cpNote:                  cpNote || "",
      credentials:             encryptCredentials(rawCredentials || {}),
      webhookToken,
    });

    res.status(201).json({ message: "Gateway created", gateway: safeGateway(gw) });
  } catch (err) {
    console.error("createCpGateway error:", err);
    res.status(500).json({ message: "Failed to create gateway" });
  }
};

// ─── CP OWNER: UPDATE GATEWAY ────────────────────────────────────────
export const updateCpGateway = async (req, res) => {
  try {
    const gw = await PaymentGateway.findOne({ _id: req.params.id, owner: req.user._id });
    if (!gw) return res.status(404).json({ message: "Gateway not found" });

    const allowed = [
      "label", "processingCurrency", "processingCurrencySymbol",
      "exchangeRate", "rateMode", "feeType", "feePercentage",
      "feeFixed", "minDeposit", "cpNote", "isActive", "isVisible",
    ];

    allowed.forEach((field) => {
      if (req.body[field] !== undefined) gw[field] = req.body[field];
    });

    // Update credentials only if provided
    if (req.body.credentials) {
      const existing  = decryptCredentials(gw.credentials);
      const merged    = { ...existing, ...req.body.credentials };
      gw.credentials  = encryptCredentials(merged);
    }

    await gw.save();
    res.json({ message: "Gateway updated", gateway: safeGateway(gw) });
  } catch (err) {
    console.error("updateCpGateway error:", err);
    res.status(500).json({ message: "Failed to update gateway" });
  }
};

// ─── CP OWNER: DELETE GATEWAY ────────────────────────────────────────
export const deleteCpGateway = async (req, res) => {
  try {
    const gw = await PaymentGateway.findOneAndDelete({ _id: req.params.id, owner: req.user._id });
    if (!gw) return res.status(404).json({ message: "Gateway not found" });
    res.json({ message: "Gateway deleted" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete gateway" });
  }
};

// ─── CP OWNER: ROTATE WEBHOOK TOKEN ──────────────────────────────────
export const rotateCpWebhookToken = async (req, res) => {
  try {
    const gw = await PaymentGateway.findOne({ _id: req.params.id, owner: req.user._id });
    if (!gw) return res.status(404).json({ message: "Gateway not found" });

    gw.webhookToken = `wh_${crypto.randomBytes(24).toString("hex")}`;
    await gw.save();

    res.json({ message: "Webhook token rotated", webhookToken: gw.webhookToken });
  } catch (err) {
    res.status(500).json({ message: "Failed to rotate token" });
  }
};

// ─── ADMIN: GET ALL GATEWAYS ─────────────────────────────────────────
export const adminGetAllGateways = async (req, res) => {
  try {
    const gateways = await PaymentGateway.find()
      .populate("owner", "email")
      .sort({ createdAt: -1 });
    res.json({ gateways: gateways.map(safeGateway) });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch gateways" });
  }
};

// ─── ADMIN: CREATE PLATFORM GATEWAY ──────────────────────────────────
export const adminCreateGateway = async (req, res) => {
  try {
    const {
      provider, label,
      processingCurrency, processingCurrencySymbol,
      exchangeRate, rateMode,
      feeType, feePercentage, feeFixed,
      minDeposit, adminNote, cpNote,
      credentials: rawCredentials,
    } = req.body;

    if (!provider || !label) {
      return res.status(400).json({ message: "provider and label are required" });
    }

    if (!getGateway(provider)) {
      return res.status(400).json({ message: "Unsupported provider" });
    }

    const webhookToken = `wh_${crypto.randomBytes(24).toString("hex")}`;

    const gw = await PaymentGateway.create({
      owner:                   null, // platform gateway
      provider,
      label,
      processingCurrency:      processingCurrency || "USD",
      processingCurrencySymbol:processingCurrencySymbol || "$",
      exchangeRate:            exchangeRate || 1,
      rateMode:                rateMode || "manual",
      feeType:                 feeType || "none",
      feePercentage:           feePercentage || 0,
      feeFixed:                feeFixed || 0,
      minDeposit:              minDeposit || 0,
      adminNote:               adminNote || "",
      cpNote:                  cpNote || "",
      credentials:             encryptCredentials(rawCredentials || {}),
      webhookToken,
    });

    res.status(201).json({ message: "Gateway created", gateway: safeGateway(gw) });
  } catch (err) {
    console.error("adminCreateGateway error:", err);
    res.status(500).json({ message: "Failed to create gateway" });
  }
};

// ─── ADMIN: UPDATE ANY GATEWAY ───────────────────────────────────────
export const adminUpdateGateway = async (req, res) => {
  try {
    const gw = await PaymentGateway.findById(req.params.id);
    if (!gw) return res.status(404).json({ message: "Gateway not found" });

    // Admin can update everything
    const allowed = [
      "label", "processingCurrency", "processingCurrencySymbol",
      "exchangeRate", "rateMode", "feeType", "feePercentage",
      "feeFixed", "minDeposit", "adminNote", "cpNote",
      "isActive", "isVisible", "adminHidden",
    ];

    allowed.forEach((field) => {
      if (req.body[field] !== undefined) gw[field] = req.body[field];
    });

    if (req.body.credentials) {
      const existing = decryptCredentials(gw.credentials);
      const merged   = { ...existing, ...req.body.credentials };
      gw.credentials = encryptCredentials(merged);
    }

    await gw.save();
    res.json({ message: "Gateway updated", gateway: safeGateway(gw) });
  } catch (err) {
    res.status(500).json({ message: "Failed to update gateway" });
  }
};

// ─── ADMIN: DELETE ANY GATEWAY ───────────────────────────────────────
export const adminDeleteGateway = async (req, res) => {
  try {
    const gw = await PaymentGateway.findByIdAndDelete(req.params.id);
    if (!gw) return res.status(404).json({ message: "Gateway not found" });
    res.json({ message: "Gateway deleted" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete gateway" });
  }
};

// ─── ADMIN: HIDE/SHOW GATEWAY FROM CP OWNER ─────────────────────────
export const adminToggleHidden = async (req, res) => {
  try {
    const gw = await PaymentGateway.findById(req.params.id);
    if (!gw) return res.status(404).json({ message: "Gateway not found" });

    gw.adminHidden = !gw.adminHidden;
    await gw.save();

    res.json({
      message: `Gateway ${gw.adminHidden ? "hidden from" : "visible to"} CP owner`,
      adminHidden: gw.adminHidden,
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to toggle visibility" });
  }
};

// ─── ADMIN: ROTATE ANY WEBHOOK TOKEN ─────────────────────────────────
export const adminRotateWebhookToken = async (req, res) => {
  try {
    const gw = await PaymentGateway.findById(req.params.id);
    if (!gw) return res.status(404).json({ message: "Gateway not found" });

    gw.webhookToken = `wh_${crypto.randomBytes(24).toString("hex")}`;
    await gw.save();

    res.json({ message: "Webhook token rotated", webhookToken: gw.webhookToken });
  } catch (err) {
    res.status(500).json({ message: "Failed to rotate token" });
  }
};
