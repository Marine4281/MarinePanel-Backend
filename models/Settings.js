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
    Support Links
    --------------------------------
    */
    supportWhatsapp: {
      type: String,
      default: "",
      trim: true,
      validate: {
        validator: function (v) {
          if (!v) return true;
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

    /*
    ================================================================
    CHILD PANEL SYSTEM
    ================================================================
    */

    /*
    Default activation fee charged to a user who wants to open
    a child panel. Admin can override per child panel individually.
    */
    childPanelActivationFee: {
      type: Number,
      default: 100,
    },

    /*
    Default billing mode for all new child panels.
    Admin can override per child panel individually.
    monthly   = flat fee every month
    per_order = fee per order processed on their panel
    both      = monthly flat + per order combined
    */
    childPanelBillingMode: {
      type: String,
      enum: ["monthly", "per_order", "both"],
      default: "monthly",
    },

    // Default monthly fee for new child panels
    childPanelMonthlyFee: {
      type: Number,
      default: 20,
    },

    // Default per-order fee for new child panels
    childPanelPerOrderFee: {
      type: Number,
      default: 0,
    },

    // Default minimum withdrawal for child panel wallets
    childPanelWithdrawMin: {
      type: Number,
      default: 10,
    },

    // Default minimum deposit when child panel uses platform gateway
    childPanelMinDeposit: {
      type: Number,
      default: 5,
    },

    /*
    --------------------------------
    CHILD PANEL OFFER / PROMO SYSTEM
    Admin can flip this on to show a discounted activation price
    on the child panel activation page with a badge.
    --------------------------------
    */

    // Is there an active offer right now?
    childPanelOfferActive: {
      type: Boolean,
      default: false,
    },

    // Label shown on the offer badge e.g. "Starter Offer", "Launch Deal"
    childPanelOfferLabel: {
      type: String,
      default: "Special Offer",
      trim: true,
    },

    // Discounted activation fee during the offer
    childPanelOfferActivationFee: {
      type: Number,
      default: 2,
    },

    // Discounted monthly fee during the offer (0 = free during offer)
    childPanelOfferMonthlyFee: {
      type: Number,
      default: 0,
    },

    // When the offer expires — null means no expiry
    childPanelOfferExpiresAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.models.Settings ||
  mongoose.model("Settings", settingsSchema);
