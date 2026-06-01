// models/PaymentProvider.js
import mongoose from "mongoose";

const paymentProviderSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    providerType: {
      type: String,
      enum: ["paystack", "flutterwave", "mpesa", "kora", "binance", "cryptomus", "manual"],
      required: true,
    },

    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },

    // Admin toggles this — if true, CP owners can see and use this provider
    visibleToCp: { type: Boolean, default: false },

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
