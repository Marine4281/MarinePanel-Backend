import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";

const orderSchema = new mongoose.Schema(
  {
    // Human-readable order ID
    orderId: {
      type: String,
      default: () => "ORD-" + uuidv4().slice(0, 8),
      unique: true,
      index: true,
    },

    // User reference
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Order details
    category: { type: String, required: true },
    service: { type: String, required: true },
    link: { type: String, required: true },
    quantity: { type: Number, required: true },
    charge: { type: Number, required: true },

    // ✅ REQUIRED for progress bar & admin UI
    quantityDelivered: {
      type: Number,
      default: 0,
    },

    // Order lifecycle
    status: {
      type: String,
      enum: [
        "pending",
        "processing",
        "completed",
        "cancelled",
        "failed",
        "refunded",
      ],
      default: "pending",
      index: true,
    },

    // Provider / SMM panel data
    provider: { type: String, default: "" },
    providerApiUrl: { type: String, default: "" },
    providerServiceId: { type: String, default: "" },
    providerOrderId: { type: String, default: "" },

    providerStatus: {
      type: String,
      enum: ["pending", "processing", "completed", "failed"],
      default: "pending",
    },

    providerResponse: { type: Object, default: null },

    // Error handling
    errorMessage: { type: String, default: "" },
  },
  {
    timestamps: true,
    strict: true, // keep schema enforcement (good practice)
  }
);

export default mongoose.models.Order ||
  mongoose.model("Order", orderSchema);