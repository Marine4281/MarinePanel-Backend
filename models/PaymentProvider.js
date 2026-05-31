// models/PaymentProvider.js
import mongoose from "mongoose";

const paymentProviderSchema = new mongoose.Schema(
  {
    // ─── OWNERSHIP ───────────────────────────────────────────
    // null = main platform provider
    // ObjId = child panel owner's provider
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    // Provider type — drives credential fields
    providerType: {
      type: String,
      enum: ["paystack", "flutterwave", "mpesa", "kora", "binance", "cryptomus", "manual"],
      required: true,
    },

    // Friendly name e.g. "Main Flutterwave Account"
    name: { type: String, required: true, trim: true },

    isActive: { type: Boolean, default: true },

    // ─── CREDENTIALS (encrypted) ─────────────────────────────
    credentials: {
      secretKey:      { type: String, default: "" },
      publicKey:      { type: String, default: "" },
      encryptionKey:  { type: String, default: "" },
      webhookSecret:  { type: String, default: "" },
      consumerKey:    { type: String, default: "" },
      consumerSecret: { type: String, default: "" },
      shortcode:      { type: String, default: "" },
      passkey:        { type: String, default: "" },
      apiKey:         { type: String, default: "" },
      merchantId:     { type: String, default: "" },
    },
  },
  { timestamps: true }
);

export default mongoose.model("PaymentProvider", paymentProviderSchema);
