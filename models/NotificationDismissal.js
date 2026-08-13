// models/NotificationDismissal.js
import mongoose from "mongoose";

const notificationDismissalSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    notificationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Notification",
      required: true,
      index: true,
    },
    dismissCount: {
      type: Number,
      default: 0,
    },
    lastDismissedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// One dismissal record per user per notification
notificationDismissalSchema.index(
  { userId: 1, notificationId: 1 },
  { unique: true }
);

export default mongoose.models.NotificationDismissal ||
  mongoose.model("NotificationDismissal", notificationDismissalSchema);
