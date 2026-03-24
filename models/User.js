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
Support Links (Final - Robust & Flexible)
--------------------------------
*/



    

    /*
    --------------------------------
    FUTURE FEATURES
    --------------------------------
    */

    // WhatsApp (number OR wa.me link)
supportWhatsapp: {
  type: String,
  default: "",
  trim: true,
  validate: {
    validator: function (v) {
      if (!v) return true; // empty string passes
      const str = String(v);
      // Allow numbers, wa.me links, or basically anything longer than 3 chars
      return str.length >= 3;
    },
    message: "Invalid WhatsApp number or link",
  },
},

// Telegram (username OR full link)
supportTelegram: {
  type: String,
  default: "",
  trim: true,
  validate: {
    validator: function (v) {
      if (!v) return true; // empty string passes
      const str = String(v);
      // Accept almost anything > 3 chars
      return str.length >= 3;
    },
    message: "Invalid Telegram username or link",
  },
},

// WhatsApp Channel / Group / Invite
supportWhatsappChannel: {
  type: String,
  default: "",
  trim: true,
  validate: {
    validator: function (v) {
      if (!v) return true; // empty string passes
      const str = String(v);
      // Accept anything that looks like a URL or just a few characters
      return str.length >= 3;
    },
    message: "Invalid WhatsApp channel/group link",
  },
},

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
