// models/User.js
import mongoose from "mongoose";

// Helper: normalize optional string fields so null/undefined => ""
const normalizeOptionalString = (v) => {
  if (v === null || v === undefined) return "";
  return String(v).trim();
};

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
      default: "",
      trim: true,
      set: normalizeOptionalString,
    },

    brandSlug: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },

    logo: {
      type: String,
      default: "",
      trim: true,
      set: normalizeOptionalString,
      validate: {
        validator: function (v) {
          // Allow empty
          if (!v) return true;

          // If provided, must be a valid URL
          return /^https?:\/\/.+/i.test(v);
        },
        message: "Logo must be a valid URL",
      },
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
      set: normalizeOptionalString,
      validate: {
        validator: function (v) {
          // ✅ Only validate if active reseller
          if (!this.isReseller || !this.resellerActivatedAt) return true;

          // Allow empty
          if (!v) return true;

          const cleaned = v.replace(/\D/g, "");

          return (
            (cleaned.length >= 7 && cleaned.length <= 15) ||
            /^(https?:\/\/)?(wa\.me|api\.whatsapp\.com)\//i.test(v)
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
      set: normalizeOptionalString,
      validate: {
        validator: function (v) {
          if (!this.isReseller || !this.resellerActivatedAt) return true;

          // Allow empty
          if (!v) return true;

          return (
            /^@?[a-zA-Z0-9_]{5,}$/.test(v) ||
            /^(https?:\/\/)?(t\.me|telegram\.me)\/[a-zA-Z0-9_]+/i.test(v)
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
      set: normalizeOptionalString,
      validate: {
        validator: function (v) {
          if (!this.isReseller || !this.resellerActivatedAt) return true;

          // Allow empty
          if (!v) return true;

          return /^(https?:\/\/)?(chat\.whatsapp\.com|wa\.me|whatsapp\.com\/channel)\//i.test(
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
  // Normalize optional branding/support strings before save
  this.brandName = normalizeOptionalString(this.brandName);
  this.logo = normalizeOptionalString(this.logo);
  this.supportWhatsapp = normalizeOptionalString(this.supportWhatsapp);
  this.supportTelegram = normalizeOptionalString(this.supportTelegram);
  this.supportWhatsappChannel = normalizeOptionalString(this.supportWhatsappChannel);

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
