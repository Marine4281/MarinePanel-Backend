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
    // Only used for admin-created notifications (cpOwner: null)
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

    /*
    ----------------------------------------------------------------
    CP OWNERSHIP
    null      = admin-created, shown platform-wide per `audience`
    ObjectId  = created by a child panel owner, shown only within
                that panel per `cpAudience`
    ----------------------------------------------------------------
    */
    cpOwner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    // Only meaningful when cpOwner is set.
    // "own"              -> users the CP owner signed up directly (resellerOwner: null)
    // "resellerEndUsers" -> end users belonging to the CP's resellers (resellerOwner set)
    // "both"             -> everyone under this child panel
    cpAudience: {
      type: String,
      enum: ["own", "resellerEndUsers", "both"],
      default: "own",
    },
  },
  { timestamps: true }
);

// Only one notification should be "isActive: true" at a time
// PER SCOPE (admin scope = cpOwner:null, each CP owner is its own scope).
// Enforced in the controllers (not schema-level) so history isn't blocked.
notificationSchema.index({ isActive: 1, cpOwner: 1 });

export default mongoose.models.Notification ||
  mongoose.model("Notification", notificationSchema);
