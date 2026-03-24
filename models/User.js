// models/User.js
import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    phone: {
      type: String,
      required: true,
      unique: true,
    },

    country: {
      type: String,
      required: true,
      default: "us",
    },

    password: {
      type: String,
      required: true,
    },

    isAdmin: {
      type: Boolean,
      default: false,
    },

    /*
    --------------------------------
    USER WALLET
    --------------------------------
    */
    balance: {
      type: Number,
      default: 0,
    },

    /*
    --------------------------------
    RESELLER SYSTEM
    --------------------------------
    */

    isReseller: {
      type: Boolean,
      default: false,
      index: true,
    },

    // Branding fields
    brandName: {
      type: String,
      default: null,
      trim: true,
    },

    brandSlug: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },

    logo: {
      type: String,
      default: null,
      trim: true,
    },

    themeColor: {
      type: String,
      default: "#ff6b00",
      trim: true,
    },

    // Domains
    resellerDomain: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },

    resellerCustomDomain: {
      type: String,
      default: null,
      trim: true,
    },

    // Commission
    resellerCommissionRate: {
      type: Number,
      default: 0,
    },

    // Earnings
    resellerWallet: {
      type: Number,
      default: 0,
    },

    resellerTotalEarned: {
      type: Number,
      default: 0,
    },

    resellerUsersCount: {
      type: Number,
      default: 0,
    },

    resellerOrdersCount: {
      type: Number,
      default: 0,
    },

    // ✅ Activation (core of SaaS gating)
    resellerActivatedAt: {
      type: Date,
      default: null,
    },

    /*
    --------------------------------
    RESELLER USER RELATION
    --------------------------------
    */
    resellerOwner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    /*
    --------------------------------
    SUPPORT (ACTIVE RESELLERS ONLY)
    --------------------------------
    */

    // WhatsApp
    supportWhatsapp: {
      type: String,
      default: "",
      trim: true,
      validate: {
        validator: function (v) {
          // ✅ Only validate if active reseller
          if (!this.isReseller || !this.resellerActivatedAt) return true;
          if (!v) return true;

          const cleaned = v.replace(/\D/g, "");

          return (
            (cleaned.length >= 7 && cleaned.length <= 15) ||
            /^(https?:\/\/)?(wa\.me)\//.test(v)
          );
        },
        message: "Invalid WhatsApp number or link",
      },
    },

    // Telegram
    supportTelegram: {
      type: String,
      default: "",
      trim: true,
      validate: {
        validator: function (v) {
          if (!this.isReseller || !this.resellerActivatedAt) return true;
          if (!v) return true;

          return (
            /^@?[a-zA-Z0-9_]{5,}$/.test(v) ||
            /^(https?:\/\/)?t\.me\/[a-zA-Z0-9_]+/.test(v)
          );
        },
        message: "Invalid Telegram username or link",
      },
    },

    // WhatsApp Channel
    supportWhatsappChannel: {
      type: String,
      default: "",
      trim: true,
      validate: {
        validator: function (v) {
          if (!this.isReseller || !this.resellerActivatedAt) return true;
          if (!v) return true;

          return /^(https?:\/\/)?(chat\.whatsapp\.com|wa\.me|whatsapp\.com\/channel)\//.test(
            v
          );
        },
        message: "Invalid WhatsApp channel/group link",
      },
    },

    /*
    --------------------------------
    FUTURE FEATURES
    --------------------------------
    */

    apiAccessEnabled: {
      type: Boolean,
      default: false,
    },

    childPanelEnabled: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

/*
--------------------------------
VIRTUAL: Active Reseller
--------------------------------
*/
userSchema.virtual("isActiveReseller").get(function () {
  return this.isReseller && !!this.resellerActivatedAt;
});

/*
--------------------------------
AUTO CLEAN SUPPORT IF NOT ACTIVE
--------------------------------
*/
userSchema.pre("save", function (next) {
  if (!this.isReseller || !this.resellerActivatedAt) {
    this.supportWhatsapp = "";
    this.supportTelegram = "";
    this.supportWhatsappChannel = "";
  }
  next();
});

/*
--------------------------------
Indexes
--------------------------------
*/
userSchema.index({ resellerOwner: 1 });
userSchema.index({ resellerDomain: 1 });
userSchema.index({ brandSlug: 1 });

const User = mongoose.model("User", userSchema);

export default User;
