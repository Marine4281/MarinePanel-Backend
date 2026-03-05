import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";

const orderSchema = new mongoose.Schema(
  {
    // ===============================
    // 🆔 Human-readable Order ID
    // ===============================
    orderId: {
      type: String,
      default: () => "ORD-" + uuidv4().slice(0, 8),
      unique: true,
      index: true,
    },

    // ===============================
    // 👤 User Reference
    // ===============================
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // ===============================
    // 📦 Order Details
    // ===============================
    category: { type: String, required: true },
    service: { type: String, required: true },
    link: { type: String, required: true },
    quantity: { type: Number, required: true },

    charge: {
      type: Number,
      required: true,
      default: 0,
    },

    // ======================================================
    // 🎁 FREE ORDER SUPPORT (Enterprise Safe Version)
    // ======================================================

    isFreeOrder: {
      type: Boolean,
      default: false,
      index: true,
    },

    // Snapshot of service config at time of order
    freeMaxQuantity: {
      type: Number,
      default: 0,
    },

    // -1 = once ever
    // 24 = every 24 hours
    // 168 = weekly
    freeCooldownHours: {
      type: Number,
      default: 0,
    },

    // ======================================================

    // ✅ REQUIRED for progress bar & admin UI
    quantityDelivered: {
      type: Number,
      default: 0,
    },

    refundProcessed: {
      type: Boolean,
      default: false,
    },

    // ===============================
    // 🔄 Order Lifecycle
    // ===============================
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

    // ===============================
    // 🔌 Provider / SMM Data
    // ===============================
    provider: { type: String, default: "" },
    providerApiUrl: { type: String, default: "" },
    providerServiceId: { type: String, default: "" },
    providerOrderId: { type: String, default: "" },

    providerStatus: {
      type: String,
      default: "pending",
    },

    providerResponse: { type: Object, default: null },

    // ===============================
    // ❌ Error Handling
    // ===============================
    errorMessage: { type: String, default: "" },
  },
  {
    timestamps: true,
    strict: true,
  }
);

// ===============================
// 🚀 Performance Indexes
// ===============================

// Fast user order lookup
orderSchema.index({ userId: 1, createdAt: -1 });

// Fast free claim validation
orderSchema.index({ userId: 1, service: 1, isFreeOrder: 1 });

// Fast admin filters
orderSchema.index({ status: 1 });
orderSchema.index({ createdAt: -1 });

export default mongoose.models.Order ||
  mongoose.model("Order", orderSchema);
