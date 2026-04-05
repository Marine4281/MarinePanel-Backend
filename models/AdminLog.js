// models/AdminLog.js
import mongoose from "mongoose";

const adminLogSchema = new mongoose.Schema(
  {
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false, // ✅ change here
      default: null,
    },

    adminEmail: {
      type: String,
      default: "unknown", // ✅ safe fallback
    },

    action: {
      type: String,
      required: true,
      index: true,
    },

    targetType: {
      type: String,
      index: true,
      default: null,
    },

    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      index: true,
      default: null,
    },

    description: {
      type: String,
      default: "",
    },

    ipAddress: {
      type: String,
      default: null,
    },

    meta: {
      type: Object,
      default: {},
    },
  },
  { timestamps: true }
);

// 🔥 Useful indexes for admin panel queries
adminLogSchema.index({ createdAt: -1 });
adminLogSchema.index({ admin: 1, createdAt: -1 });

export default mongoose.model("AdminLog", adminLogSchema);
