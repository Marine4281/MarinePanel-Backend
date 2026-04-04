// models/AdminLog.js
import mongoose from "mongoose";

const adminLogSchema = new mongoose.Schema(
  {
    // ✅ Keep ObjectId for relations
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // 🆕 Add email for fast readable logs (no populate needed)
    adminEmail: {
      type: String,
    },

    action: {
      type: String,
      required: true,
      index: true, // 🔥 faster filtering
    },

    targetType: {
      type: String, // user, order, service, withdrawal
      index: true,
    },

    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      index: true,
    },

    description: {
      type: String,
    },

    ipAddress: {
      type: String,
    },
  },
  { timestamps: true }
);

// 🔥 Useful indexes for admin panel queries
adminLogSchema.index({ createdAt: -1 });
adminLogSchema.index({ admin: 1, createdAt: -1 });

export default mongoose.model("AdminLog", adminLogSchema);
