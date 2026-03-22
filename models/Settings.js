// models/Settings.js
import mongoose from "mongoose";

const settingsSchema = new mongoose.Schema(
  {
    // Admin commission percentage
    commission: {
      type: Number,
      default: 50, // 50%
    },

    // Platform total revenue
    totalRevenue: {
      type: Number,
      default: 0,
    },

    // Reseller activation fee
    resellerActivationFee: {
      type: Number,
      default: 25,
    },

    // Minimum reseller withdraw amount
    resellerWithdrawMin: {
      type: Number,
      default: 10,
    },

    /*
    --------------------------------
    Support Links (Improved)
    --------------------------------
    */
    supportWhatsapp: {
      type: String,
      default: "",
      trim: true,
      validate: {
        validator: function (v) {
          if (!v) return true; // allow empty
          const cleaned = v.replace(/\D/g, "");
          return cleaned.length >= 7 && cleaned.length <= 15;
        },
        message: "Invalid WhatsApp number",
      },
    },

    supportTelegram: {
      type: String,
      default: "",
      trim: true,
      validate: {
        validator: function (v) {
          if (!v) return true;
          return typeof v === "string";
        },
      },
    },

    supportWhatsappChannel: {
      type: String,
      default: "",
      trim: true,
      validate: {
        validator: function (v) {
          if (!v) return true;
          return v.startsWith("http");
        },
        message: "Channel must be a valid link",
      },
    },

    // Platform domain used for reseller subdomains
    platformDomain: {
      type: String,
      default: "marinepanel.online",
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.models.Settings ||
  mongoose.model("Settings", settingsSchema);
