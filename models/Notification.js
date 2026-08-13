// models/Notification.js
import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },

    // "all" | "platform" | "reseller" | "cp"
    audience: {
      type: String,
      enum: ["all", "platform", "reseller", "cp"],
      default: "platform",
    },

    // Admin can pause/resume without deleting
    isActive: {
      type: Boolean,
      default: true,
    },

    // How long it keeps showing to a given user
    // "days"          -> stops after limitValue days from createdAt
    // "dismissCount"  -> stops after user cancels it limitValue times
    limitType: {
      type: String,
      enum: ["days", "dismissCount"],
      default: "dismissCount",
    },
    limitValue: {
      type: Number,
      default: 3, // 3 cancels by default, or 3 days if limitType = "days"
      min: 1,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

// Only one notification should be "isActive: true" at a time.
// Enforced in the controller (not schema-level) so history isn't blocked.
notificationSchema.index({ isActive: 1 });

export default mongoose.models.Notification ||
  mongoose.model("Notification", notificationSchema);
