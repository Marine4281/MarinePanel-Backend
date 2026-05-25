import mongoose from "mongoose";

const cpAdminLogSchema = new mongoose.Schema(
  {
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
      default: null,
    },
    adminEmail: { type: String, default: "unknown" },
    childPanel: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ChildPanel",
      required: true,
      index: true,
    },
    action: { type: String, required: true, index: true },
    targetType: { type: String, index: true, default: null },
    targetId: { type: mongoose.Schema.Types.ObjectId, index: true, default: null },
    description: { type: String, default: "" },
    ipAddress: { type: String, default: null },
    meta: { type: Object, default: {} },
  },
  { timestamps: true }
);

cpAdminLogSchema.index({ createdAt: -1 });
cpAdminLogSchema.index({ admin: 1, createdAt: -1 });
cpAdminLogSchema.index({ childPanel: 1, createdAt: -1 });

export default mongoose.model("CpAdminLog", cpAdminLogSchema);
