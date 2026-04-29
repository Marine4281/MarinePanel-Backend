// models/User.js
import mongoose from "mongoose";

const normalizeCountryCode = (value) => {
  if (!value) return value;

  const map = {
    "united states": "US",
    "usa": "US",
    "us": "US",
    "kenya": "KE",
  };

  const cleaned = value.toString().trim().toLowerCase();
  return map[cleaned] || cleaned.toUpperCase();
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

    // Display only
    country: {
      type: String,
      required: true,
      trim: true,
    },

    // SOURCE OF TRUTH (for flags, logic)
    countryCode: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      set: normalizeCountryCode,
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
    ACCOUNT CONTROL
    --------------------------------
    */
    isBlocked: {
      type: Boolean,
      default: false,
      index: true,
    },

    isFrozen: {
      type: Boolean,
      default: false,
      index: true,
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
    //Last  Seen
    lastSeen: {
      type: Date,
      default: null,
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

    domainType: {
      type: String,
      enum: ["custom", "subdomain"],
      default: "subdomain",
    },

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

    resellerCommissionRate: {
      type: Number,
      default: 0,
    },

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

    /*
    --------------------------------
    FUTURE FEATURES
    --------------------------------
    */
    apiAccessEnabled: {
      type: Boolean,
      default: false,
    },

    apiKey: {
      type: String,
      unique: true,
      sparse: true,
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
Indexes
--------------------------------
*/
userSchema.index({ resellerOwner: 1 });
userSchema.index({ resellerDomain: 1 });
userSchema.index({ brandSlug: 1 });

const User = mongoose.model("User", userSchema);

export default User;
