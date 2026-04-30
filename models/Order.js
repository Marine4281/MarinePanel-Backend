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

    customOrderId: {
      type: Number,
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
       👥 RESELLER
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
       👥 CHILD PANEL
    =============================== */

    // Which child panel does this order belong to?
    // null = order placed on main platform or a platform reseller
    // ObjId = order placed on a reseller that is under a child panel
    childPanelOwner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
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

    serviceId: {
      type: String,
      default: "",
      index: true,
    },

    rate: {
      type: Number,
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

    isCharged: {
      type: Boolean,
      default: false,
      index: true,
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

    /* =====================================================
       🧠 SNAPSHOT FROM SERVICE
    ===================================================== */

    cancelAllowed: {
      type: Boolean,
      default: false,
    },

    refillAllowed: {
      type: Boolean,
      default: false,
    },

    refillPolicy: {
      type: String,
      enum: ["none", "30d", "60d", "90d", "365d", "lifetime", "custom"],
      default: "none",
    },

    customRefillDays: {
      type: Number,
      default: null,
    },

    completedAt: {
      type: Date,
      default: null,
      index: true,
    },

    /* =====================================================
       ❌ CANCEL SYSTEM
    ===================================================== */

    cancelRequested: {
      type: Boolean,
      default: false,
      index: true,
    },

    cancelRequestedAt: {
      type: Date,
      default: null,
    },

    cancelProcessed: {
      type: Boolean,
      default: true,
      index: true,
    },

    cancelStatus: {
      type: String,
      enum: ["none", "success", "failed"],
      default: "none",
    },

    /* =====================================================
       🔁 REFILL SYSTEM
    ===================================================== */

    refillRequested: {
      type: Boolean,
      default: false,
      index: true,
    },

    refillRequestedAt: {
      type: Date,
      default: null,
    },

    refillProcessed: {
      type: Boolean,
      default: false,
      index: true,
    },

    refillStatus: {
      type: String,
      enum: ["none", "pending", "processing", "completed", "rejected"],
      default: "none",
    },

    refillId: {
      type: String,
      default: "",
    },

    /* ===============================
       🔌 PROVIDER
    =============================== */

    providerProfileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProviderProfile",
      index: true,
    },

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
   🧠 AUTO TIMESTAMP COMPLETION
=============================== */
orderSchema.pre("save", function () {
  if (this.status === "completed" && !this.completedAt) {
    this.completedAt = new Date();
  }
});

/* ===============================
   🚀 INDEXES
=============================== */

orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ resellerOwner: 1, createdAt: -1 });
orderSchema.index({ resellerOwner: 1, earningsCredited: 1 });
orderSchema.index({ userId: 1, service: 1, isFreeOrder: 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ createdAt: -1 });
orderSchema.index({ refundProcessed: 1 });
orderSchema.index({ cancelRequested: 1, cancelProcessed: 1 });
orderSchema.index({ refillRequested: 1, refillProcessed: 1 });

// Child panel indexes (new)
orderSchema.index({ childPanelOwner: 1, createdAt: -1 });

export default mongoose.models.Order ||
  mongoose.model("Order", orderSchema);
