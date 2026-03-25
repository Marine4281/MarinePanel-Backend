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

    // Branding fields (used everywhere)
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

    // Subdomain and custom domain
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

    // Commission percentage
    resellerCommissionRate: {
      type: Number,
      default: 0,
    },

    // Reseller wallet (earnings)
    resellerWallet: {
      type: Number,
      default: 0,
    },

    // Total earnings
    resellerTotalEarned: {
      type: Number,
      default: 0,
    },

    // Total users under reseller
    resellerUsersCount: {
      type: Number,
      default: 0,
    },

    // Total orders from reseller users
    resellerOrdersCount: {
      type: Number,
      default: 0,
    },

    // Activation time
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
    Support Links (Improved)
    --------------------------------
    */
    supportWhatsapp: {
      type: String,
      default: "",
      trim: true,
      validate: {
        validator: function (v) {
          if (!v) return true; // allow null
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
Indexes for fast reseller queries
--------------------------------
*/
userSchema.index({ resellerOwner: 1 });
userSchema.index({ resellerDomain: 1 });
userSchema.index({ brandSlug: 1 });

const User = mongoose.model("User", userSchema);

export default User;
