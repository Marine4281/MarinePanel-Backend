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

    // If user activated reseller panel
    isReseller: {
      type: Boolean,
      default: false,
      index: true,
    },

    // Brand name
    resellerBrand: {
      type: String,
      default: null,
      trim: true,
    },

    // Subdomain
    resellerDomain: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },

    // Optional custom domain
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

    // If user belongs to a reseller
    resellerOwner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
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
Indexes for fast reseller queries
*/
userSchema.index({ resellerOwner: 1 });
userSchema.index({ resellerDomain: 1 });

const User = mongoose.model("User", userSchema);

export default User;
