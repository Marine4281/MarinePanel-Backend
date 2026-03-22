// models/Order.js
import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";

const orderSchema = new mongoose.Schema(
  {
    /* ===============================
       🆔 Order ID
    =============================== */
    orderId: {
      type: String,
      default: () => "ORD-" + uuidv4().slice(0, 8),
      unique: true,
      index: true,
    },

    /* ===============================
       👤 USER
    =============================== */
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    /* ===============================
       👥 RESELLER (🔥 REQUIRED)
    =============================== */
    resellerOwner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    resellerCommission: {
      type: Number,
      default: 0,
    },

    earningsCredited: {
      type: Boolean,
      default: false,
      index: true,
    },

    /* ===============================
       📦 ORDER DETAILS
    =============================== */
    category: { type: String, required: true },
    service: { type: String, required: true },
    link: { type: String, required: true },
    quantity: { type: Number, required: true },

    charge: {
      type: Number,
      required: true,
      default: 0,
    },

    /* ===============================
       🎁 FREE ORDER SYSTEM
    =============================== */
    isFreeOrder: {
      type: Boolean,
      default: false,
      index: true,
    },

    freeMaxQuantity: {
      type: Number,
      default: 0,
    },

    freeCooldownHours: {
      type: Number,
      default: 0,
    },

    /* ===============================
       📊 DELIVERY TRACKING
    =============================== */
    quantityDelivered: {
      type: Number,
      default: 0,
    },

    /* ===============================
       💸 REFUND SAFETY
    =============================== */
    refundProcessed: {
      type: Boolean,
      default: false,
      index: true,
    },

    /* ===============================
       🔄 STATUS
    =============================== */
    status: {
      type: String,
      enum: [
        "pending",
        "processing",
        "completed",
        "partial",
        "cancelled",
        "failed",
        "refunded",
      ],
      default: "pending",
      index: true,
    },

    /* ===============================
       🔌 PROVIDER
    =============================== */
    provider: { type: String, default: "" },
    providerApiUrl: { type: String, default: "" },
    providerServiceId: { type: String, default: "" },
    providerOrderId: { type: String, default: "" },

    providerStatus: {
      type: String,
      default: "pending",
    },

    providerResponse: {
      type: Object,
      default: null,
    },

    /* ===============================
       ❌ ERROR
    =============================== */
    errorMessage: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
    strict: true,
  }
);

/* ===============================
   🚀 INDEXES (OPTIMIZED)
=============================== */

// User orders
orderSchema.index({ userId: 1, createdAt: -1 });

// Reseller dashboard (🔥 IMPORTANT)
orderSchema.index({ resellerOwner: 1, createdAt: -1 });

// Earnings queries (🔥 IMPORTANT)
orderSchema.index({ resellerOwner: 1, earningsCredited: 1 });

// Free service checks
orderSchema.index({ userId: 1, service: 1, isFreeOrder: 1 });

// Admin filters
orderSchema.index({ status: 1 });
orderSchema.index({ createdAt: -1 });

// Refund safety
orderSchema.index({ refundProcessed: 1 });

export default mongoose.models.Order ||
  mongoose.model("Order", orderSchema);
