//models//AdminLog.js
import mongoose from "mongoose";

const adminLogSchema = new mongoose.Schema(
  {
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    action: {
      type: String,
      required: true,
    },
    targetType: {
      type: String, // user, order, service, withdrawal
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
    },
    description: {
      type: String,
    },
    ipAddress: String,
  },
  { timestamps: true }
);

export default mongoose.model("AdminLog", adminLogSchema);
