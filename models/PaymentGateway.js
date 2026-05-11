// models/PaymentGateway.js
import mongoose from "mongoose";

const paymentGatewaySchema = new mongoose.Schema(
  {
    // ─── OWNERSHIP ───────────────────────────────────────────
    // null  = platform (main admin) gateway
    // ObjId = child panel owner's gateway
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    // ─── PROVIDER ────────────────────────────────────────────
    provider: {
      type: String,
      enum: ["paystack", "flutterwave", "mpesa", "kora", "binance", "cryptomus", "manual"],
      required: true,
    },

    label: { type: String, required: true, trim: true },

    // ─── CURRENCY & CONVERSION ───────────────────────────────
    processingCurrency: { type: String, default: "USD", uppercase: true, trim: true },
    processingCurrencySymbol: { type: String, default: "$", trim: true },

    // How many units of processingCurrency = 1 USD (e.g. 129 for KES)
    exchangeRate: { type: Number, default: 1, min: 0 },
    rateMode: { type: String, enum: ["manual", "live"], default: "manual" },

    // ─── FEES (in processingCurrency) ────────────────────────
    feeType: { type: String, enum: ["none", "fixed", "percentage", "both"], default: "none" },
    feePercentage: { type: Number, default: 0, min: 0 },  // e.g. 2.5 = 2.5%
    feeFixed:      { type: Number, default: 0, min: 0 },  // flat fee

    // ─── NOTES ───────────────────────────────────────────────
    adminNote: { type: String, default: "", trim: true },  // admin writes, CP reads
    cpNote:    { type: String, default: "", trim: true },  // CP owner writes, users read

    // ─── CONTROLS ────────────────────────────────────────────
    minDeposit:  { type: Number,  default: 0,     min: 0 }, // in USD
    isActive:    { type: Boolean, default: true  },          // CP owner can toggle
    isVisible:   { type: Boolean, default: true  },          // CP owner can toggle
    adminHidden: { type: Boolean, default: false },          // admin only — CP cannot override

    // ─── CREDENTIALS (encrypted — see utils/encryptCredentials.js) ──
    credentials: {
      // Paystack / Flutterwave / Kora
      secretKey:     { type: String, default: "" },
      publicKey:     { type: String, default: "" },
      encryptionKey: { type: String, default: "" }, // Flutterwave only
      webhookSecret: { type: String, default: "" }, // for signature verification

      // M-Pesa Daraja
      consumerKey:    { type: String, default: "" },
      consumerSecret: { type: String, default: "" },
      shortcode:      { type: String, default: "" },
      passkey:        { type: String, default: "" },

      // Binance Pay
      apiKey: { type: String, default: "" },        // Certificate SN / API Key

      // Cryptomus
      merchantId: { type: String, default: "" },    // Merchant UUID
    },

    // ─── WEBHOOK ─────────────────────────────────────────────
    // Auto-generated on creation. CP owner pastes this URL into their provider dashboard.
    // Format: POST /api/webhooks/{provider}/{webhookToken}
    webhookToken: { type: String, unique: true, sparse: true },
  },
  { timestamps: true }
);

paymentGatewaySchema.index({ owner: 1, provider: 1 });

export default mongoose.model("PaymentGateway", paymentGatewaySchema);
