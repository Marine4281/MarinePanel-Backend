// models/PaymentGateway.js
import mongoose from "mongoose";

const paymentGatewaySchema = new mongoose.Schema(
  {
    // ─── OWNERSHIP ───────────────────────────────────────────
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    // ─── PROVIDER LINK ───────────────────────────────────────
    // Points to the saved ProviderProfile (admin's API credentials)
    providerProfile: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PaymentProvider",
      default: null,
    },

    // ─── GATEWAY IDENTITY ────────────────────────────────────
    // User-facing name — never shows provider brand
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },

    // ─── PAYMENT MODE ────────────────────────────────────────
    // Drives what fields end user sees on deposit page
    paymentMode: {
      type: String,
      enum: ["hosted", "mpesa", "momo", "airtel", "card", "bank", "crypto", "binance", "manual"],
      default: "hosted",
    },
    
    // Reference to a platform gateway (when CP owner connects an admin gateway)
   platformGatewayRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PaymentGateway",
      default: null,
  },

    isPlatformConnected: { type: Boolean, default: false },

    // For binance manual mode — shown to user
    binanceId: { type: String, default: "" },

    // For manual mode — instructions shown to user
    paymentInstructions: { type: String, default: "" },

    // ─── CURRENCY & CONVERSION ───────────────────────────────
    processingCurrency: { type: String, default: "USD", uppercase: true, trim: true },
    processingCurrencySymbol: { type: String, default: "$", trim: true },
    exchangeRate: { type: Number, default: 1, min: 0 },
    rateMode: { type: String, enum: ["manual", "live"], default: "manual" },

    // ─── FEES ────────────────────────────────────────────────
    feeType: {
      type: String,
      enum: ["none", "fixed", "percentage", "both"],
      default: "none",
    },
    feePercentage: { type: Number, default: 0, min: 0 },
    feeFixed: { type: Number, default: 0, min: 0 },

    // ─── MANUAL SUB-TYPE (only used when paymentMode === "manual") ──
    manualType: {
      type: String,
      enum: [null, "mpesa", "momo", "airtel", "bank", "other"],
      default: null,
    },
    manualConfig: {
      number:        { type: String, default: "" }, // phone number (mpesa/momo/airtel/other)
      holderName:    { type: String, default: "" }, // optional name shown to sender
      bankName:      { type: String, default: "" }, // bank mode only
      accountNumber: { type: String, default: "" }, // bank mode only
      accountName:   { type: String, default: "" }, // bank mode only
    },

    // ─── BINANCE MANUAL EXTRAS ────────────────────────────────────────
    binanceName: { type: String, default: "" }, // admin's name, shown to sender
    qrImageUrl:  { type: String, default: "" }, // Binance QR code image URL
    // ─── NOTES ───────────────────────────────────────────────
    adminNote: { type: String, default: "", trim: true }, // admin writes, CP reads
    cpNote:    { type: String, default: "", trim: true }, // CP owner writes for users

    // ─── CONTROLS ────────────────────────────────────────────
    minDeposit:  { type: Number,  default: 0,     min: 0 },
    supportsWithdraw: { type: Boolean, default: false }, // admin enables payout for this gateway
    minWithdraw:      { type: Number,  default: 0, min: 0 },
    isActive:    { type: Boolean, default: true  },
    isVisible:   { type: Boolean, default: true  }, // visible to end users
    adminHidden: { type: Boolean, default: false }, // admin hides from CP owners
    visibleToCp: { type: Boolean, default: false }, // admin must explicitly allow CP to see/use

    // ─── WEBHOOK ─────────────────────────────────────────────
    webhookToken: { type: String, unique: true, sparse: true },
  },
  { timestamps: true }
);

paymentGatewaySchema.index({ owner: 1 });
paymentGatewaySchema.index({ isVisible: 1, adminHidden: 1 });

export default mongoose.model("PaymentGateway", paymentGatewaySchema);
