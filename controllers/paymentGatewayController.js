// controllers/paymentGatewayController.js
import crypto from "crypto";
import PaymentGateway  from "../models/PaymentGateway.js";
import PaymentProvider from "../models/PaymentProvider.js";
import Transaction     from "../models/Transaction.js";
import Wallet          from "../models/Wallet.js";
import User            from "../models/User.js";
import { getGateway, getProvidersMeta } from "../utils/gateways/index.js";
import { encryptCredentials, decryptCredentials } from "../utils/encryptCredentials.js";
import { calculateFee } from "../utils/calculateFee.js";

// ─── HELPERS ─────────────────────────────────────────────────────────

const calcBalance = (transactions = []) =>
  transactions
    .filter((t) => t.status === "Completed")
    .reduce((acc, t) => acc + (Number(t.amount) || 0), 0);

const safeGateway = (gw) => ({
  _id:                      gw._id,
  name:                     gw.name,
  description:              gw.description,
  paymentMode:              gw.paymentMode,
  binanceId:                gw.binanceId,
  binanceName:              gw.binanceName,
  qrImageUrl:               gw.qrImageUrl,
  manualType:               gw.manualType,
  manualConfig:             gw.manualConfig,
  paymentInstructions:      gw.paymentInstructions,
  processingCurrency:       gw.processingCurrency,
  processingCurrencySymbol: gw.processingCurrencySymbol,
  exchangeRate:             gw.exchangeRate,
  feeType:                  gw.feeType,
  feePercentage:            gw.feePercentage,
  feeFixed:                 gw.feeFixed,
  adminNote:                gw.adminNote,
  cpNote:                   gw.cpNote,
  minDeposit:               gw.minDeposit,
  isActive:                 gw.isActive,
  isVisible:                gw.isVisible,
  adminHidden:              gw.adminHidden,
  visibleToCp:              gw.visibleToCp,
  webhookToken:             gw.webhookToken,
  providerProfile:          gw.providerProfile,
  owner:                    gw.owner,
  createdAt:                gw.createdAt,
  providerType:             gw.providerProfile?.providerType || null,
});

const safeProvider = (p) => ({
  _id:          p._id,
  name:         p.name,
  providerType: p.providerType,
  isActive:     p.isActive,
  owner:        p.owner,
  createdAt:    p.createdAt,
  // credentials intentionally omitted
  hasCredentials: !!(p.credentials?.secretKey || p.credentials?.apiKey || p.credentials?.consumerKey),
});

// ─── PUBLIC: GET PROVIDERS META ──────────────────────────────────────
export const getProviders = (_req, res) => {
  res.json({ providers: getProvidersMeta() });
};

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

  // NEW — if this depositor is a child panel owner, retry any reseller
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

// ─── ADMIN: PROVIDER CRUD ─────────────────────────────────────────────
export const adminGetProviders = async (req, res) => {
  try {
    const providers = await PaymentProvider.find({ owner: null }).sort({ createdAt: -1 });
    res.json({ providers: providers.map(safeProvider) });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch providers" });
  }
};

export const adminCreateProvider = async (req, res) => {
  try {
    const { name, providerType, credentials: raw, isActive } = req.body;
    if (!name || !providerType) {
      return res.status(400).json({ message: "name and providerType required" });
    }

    const provider = await PaymentProvider.create({
      owner:       null,
      name,
      providerType,
      isActive:    isActive !== false,
      credentials: encryptCredentials(raw || {}),
    });

    res.status(201).json({ message: "Provider created", provider: safeProvider(provider) });
  } catch (err) {
    console.error("adminCreateProvider error:", err);
    res.status(500).json({ message: "Failed to create provider" });
  }
};

export const adminUpdateProvider = async (req, res) => {
  try {
    const provider = await PaymentProvider.findOne({ _id: req.params.id, owner: null });
    if (!provider) return res.status(404).json({ message: "Provider not found" });

    if (req.body.name)     provider.name     = req.body.name;
    if (req.body.isActive !== undefined) provider.isActive = req.body.isActive;
    if (req.body.visibleToCp !== undefined) provider.visibleToCp = req.body.visibleToCp;

    if (req.body.credentials) {
      const existing = decryptCredentials(provider.credentials);
      const merged   = { ...existing, ...req.body.credentials };
      provider.credentials = encryptCredentials(merged);
    }

    await provider.save();
    res.json({ message: "Provider updated", provider: safeProvider(provider) });
  } catch (err) {
    res.status(500).json({ message: "Failed to update provider" });
  }
};

export const adminDeleteProvider = async (req, res) => {
  try {
    // Check if any gateway uses this provider
    const inUse = await PaymentGateway.findOne({ providerProfile: req.params.id });
    if (inUse) {
      return res.status(400).json({
        message: "Cannot delete — provider is used by one or more gateways",
      });
    }
    await PaymentProvider.findOneAndDelete({ _id: req.params.id, owner: null });
    res.json({ message: "Provider deleted" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete provider" });
  }
};

// ─── ADMIN: GATEWAY CRUD ─────────────────────────────────────────────
export const adminGetAllGateways = async (req, res) => {
  try {
    const gateways = await PaymentGateway.find()
      .populate("providerProfile", "name providerType")
      .populate("owner", "email")
      .sort({ createdAt: -1 });
    res.json({ gateways: gateways.map(safeGateway) });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch gateways" });
  }
};

export const adminCreateGateway = async (req, res) => {
  try {
    const {
      name, description, paymentMode,
      providerProfile, binanceId, binanceName, qrImageUrl,
      manualType, manualConfig, paymentInstructions,
      processingCurrency, processingCurrencySymbol,
      exchangeRate, feeType, feePercentage, feeFixed,
      minDeposit, adminNote, cpNote,
      isVisible, visibleToCp,
    } = req.body;

    if (!name) return res.status(400).json({ message: "name is required" });

    const webhookToken = `wh_${crypto.randomBytes(24).toString("hex")}`;

    const gw = await PaymentGateway.create({
      owner:                    null,
      name,
      description:              description              || "",
      paymentMode:              paymentMode              || "hosted",
      providerProfile:          providerProfile          || null,
      binanceId:                binanceId                || "",
      binanceName:              binanceName              || "",
      qrImageUrl:               qrImageUrl               || "",
      manualType:               manualType               || null,
      manualConfig:             manualConfig             || {},
      paymentInstructions:      paymentInstructions      || "",
      processingCurrency:       processingCurrency       || "USD",
      processingCurrencySymbol: processingCurrencySymbol || "$",
      exchangeRate:             exchangeRate             || 1,
      feeType:                  feeType                  || "none",
      feePercentage:            feePercentage            || 0,
      feeFixed:                 feeFixed                 || 0,
      minDeposit:               minDeposit               || 0,
      adminNote:                adminNote                || "",
      cpNote:                   cpNote                   || "",
      isVisible:                isVisible  !== false,
      visibleToCp:              visibleToCp === true,
      webhookToken,
    });

    res.status(201).json({ message: "Gateway created", gateway: safeGateway(gw) });
  } catch (err) {
    console.error("adminCreateGateway error:", err);
    res.status(500).json({ message: "Failed to create gateway" });
  }
};

export const adminUpdateGateway = async (req, res) => {
  try {
    const gw = await PaymentGateway.findById(req.params.id);
    if (!gw) return res.status(404).json({ message: "Gateway not found" });

    const fields = [
      "name", "description", "paymentMode", "providerProfile",
      "binanceId", "binanceName", "qrImageUrl",
      "manualType", "manualConfig", "paymentInstructions",
      "processingCurrency", "processingCurrencySymbol", "exchangeRate",
      "feeType", "feePercentage", "feeFixed", "minDeposit",
      "adminNote", "cpNote", "isActive", "isVisible",
      "adminHidden", "visibleToCp",
    ];

    fields.forEach((f) => { if (req.body[f] !== undefined) gw[f] = req.body[f]; });
    await gw.save();

    res.json({ message: "Gateway updated", gateway: safeGateway(gw) });
  } catch (err) {
    res.status(500).json({ message: "Failed to update gateway" });
  }
};

export const adminToggleHidden = async (req, res) => {
  try {
    const gw = await PaymentGateway.findById(req.params.id);
    if (!gw) return res.status(404).json({ message: "Gateway not found" });
    gw.adminHidden = !gw.adminHidden;
    await gw.save();
    res.json({ message: `Gateway ${gw.adminHidden ? "hidden" : "visible"}`, adminHidden: gw.adminHidden });
  } catch (err) {
    res.status(500).json({ message: "Failed to toggle" });
  }
};

export const adminRotateWebhookToken = async (req, res) => {
  try {
    const gw = await PaymentGateway.findById(req.params.id);
    if (!gw) return res.status(404).json({ message: "Gateway not found" });
    gw.webhookToken = `wh_${crypto.randomBytes(24).toString("hex")}`;
    await gw.save();
    res.json({ message: "Token rotated", webhookToken: gw.webhookToken });
  } catch (err) {
    res.status(500).json({ message: "Failed to rotate token" });
  }
};

// ─── CP OWNER: GET GATEWAYS ──────────────────────────────────────────
// CP owner only sees platform gateways where visibleToCp=true + their own
// ─── CP OWNER: GET AVAILABLE PLATFORM PROVIDERS ──────────────────────
// CP owner sees only providers admin marked visibleToCp=true
// Used when CP owner is creating their own gateway — they pick a provider
export const getCpAvailableProviders = async (req, res) => {
  try {
    const providers = await PaymentProvider.find({
      owner:       null,
      isActive:    true,
      visibleToCp: true,
    }).select("name providerType"); // never return credentials

    res.json({ providers });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch providers" });
  }
};

// ─── CP OWNER: GET GATEWAYS ──────────────────────────────────────────
// Returns:
// 1. Platform gateways where visibleToCp=true (read-only, can connect)
// 2. CP owner's own gateways
export const getCpGateways = async (req, res) => {
  try {
    const [platformGateways, ownGateways] = await Promise.all([
      PaymentGateway.find({ owner: null, visibleToCp: true, adminHidden: false })
        .populate("providerProfile", "providerType name"),
      PaymentGateway.find({ owner: req.user._id })
        .populate("providerProfile", "providerType name"),
    ]);

    res.json({
      platformGateways: platformGateways.map(safeGateway),
      ownGateways:      ownGateways.map(safeGateway),
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch gateways" });
  }
};

// ─── CP OWNER: CONNECT PLATFORM GATEWAY ─────────────────────────────
// CP owner connects to one of admin's platform gateways
// Creates a reference gateway under CP owner that points to the platform gateway
export const connectPlatformGateway = async (req, res) => {
  try {
    const { platformGatewayId } = req.body;

    const platform = await PaymentGateway.findOne({
      _id:         platformGatewayId,
      owner:       null,
      visibleToCp: true,
      adminHidden: false,
    }).populate("providerProfile");

    if (!platform) {
      return res.status(404).json({ message: "Platform gateway not found" });
    }

    // Check not already connected
    const existing = await PaymentGateway.findOne({
      owner:             req.user._id,
      platformGatewayRef: platformGatewayId,
    });

    if (existing) {
      return res.status(400).json({ message: "Already connected to this gateway" });
    }

    const webhookToken = `wh_${crypto.randomBytes(24).toString("hex")}`;

    // Create a CP-owned copy that references the platform gateway
    const gw = await PaymentGateway.create({
      owner:                    req.user._id,
      platformGatewayRef:       platformGatewayId, // reference to platform gateway
      name:                     platform.name,
      description:              platform.description,
      paymentMode:              platform.paymentMode,
      providerProfile:          platform.providerProfile?._id || null,
      binanceId:                platform.binanceId,
      paymentInstructions:      platform.paymentInstructions,
      processingCurrency:       platform.processingCurrency,
      processingCurrencySymbol: platform.processingCurrencySymbol,
      exchangeRate:             platform.exchangeRate,
      feeType:                  platform.feeType,
      feePercentage:            platform.feePercentage,
      feeFixed:                 platform.feeFixed,
      minDeposit:               platform.minDeposit,
      adminNote:                platform.adminNote,
      isVisible:                true,
      visibleToCp:              false,
      isPlatformConnected:      true, // flag — uses platform provider
      webhookToken,
    });

    res.status(201).json({ message: "Gateway connected", gateway: safeGateway(gw) });
  } catch (err) {
    console.error("connectPlatformGateway error:", err);
    res.status(500).json({ message: "Failed to connect gateway" });
  }
};

// ─── CP OWNER: CREATE OWN GATEWAY ────────────────────────────────────
export const createCpGateway = async (req, res) => {
  try {
    const {
      name, description, paymentMode,
      providerProfile, binanceId, binanceName, qrImageUrl,
      manualType, manualConfig, paymentInstructions,
      processingCurrency, processingCurrencySymbol,
      exchangeRate, feeType, feePercentage, feeFixed,
      minDeposit, cpNote, isVisible,
    } = req.body;

    if (!name) return res.status(400).json({ message: "name is required" });

    if (providerProfile) {
      const provider = await PaymentProvider.findOne({
        _id:         providerProfile,
        owner:       null,
        visibleToCp: true,
        isActive:    true,
      });
      if (!provider) {
        return res.status(400).json({ message: "Selected provider is not available" });
      }
    }

    const webhookToken = `wh_${crypto.randomBytes(24).toString("hex")}`;

    const gw = await PaymentGateway.create({
      owner:                    req.user._id,
      name,
      description:              description              || "",
      paymentMode:              paymentMode              || "hosted",
      providerProfile:          providerProfile          || null,
      binanceId:                binanceId                || "",
      binanceName:              binanceName              || "",
      qrImageUrl:               qrImageUrl               || "",
      manualType:               manualType               || null,
      manualConfig:             manualConfig             || {},
      paymentInstructions:      paymentInstructions      || "",
      processingCurrency:       processingCurrency       || "USD",
      processingCurrencySymbol: processingCurrencySymbol || "$",
      exchangeRate:             exchangeRate             || 1,
      feeType:                  feeType                  || "none",
      feePercentage:            feePercentage            || 0,
      feeFixed:                 feeFixed                 || 0,
      minDeposit:               minDeposit               || 0,
      cpNote:                   cpNote                   || "",
      isVisible:                isVisible !== false,
      visibleToCp:              false,
      webhookToken,
    });

    res.status(201).json({ message: "Gateway created", gateway: safeGateway(gw) });
  } catch (err) {
    res.status(500).json({ message: "Failed to create gateway" });
  }
};

export const updateCpGateway = async (req, res) => {
  try {
    const gw = await PaymentGateway.findOne({ _id: req.params.id, owner: req.user._id });
    if (!gw) return res.status(404).json({ message: "Gateway not found" });

    const allowed = [
      "name", "description", "paymentMode",
      "binanceId", "binanceName", "qrImageUrl",
      "manualType", "manualConfig", "paymentInstructions",
      "processingCurrency", "processingCurrencySymbol", "exchangeRate",
      "feeType", "feePercentage", "feeFixed", "minDeposit",
      "cpNote", "isActive", "isVisible",
    ];

    allowed.forEach((f) => { if (req.body[f] !== undefined) gw[f] = req.body[f]; });
    await gw.save();

    res.json({ message: "Gateway updated", gateway: safeGateway(gw) });
  } catch (err) {
    res.status(500).json({ message: "Failed to update gateway" });
  }
};
// ─── CP OWNER: DELETE OWN GATEWAY ────────────────────────────────────
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
    res.json({ message: "Token rotated", webhookToken: gw.webhookToken });
  } catch (err) {
    res.status(500).json({ message: "Failed to rotate token" });
  }
};
