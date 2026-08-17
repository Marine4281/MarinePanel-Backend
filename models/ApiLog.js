// models/ApiLog.js
import mongoose from "mongoose";

const apiLogSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
  apiKeyMasked: { type: String },
  action: { type: String, index: true }, // add, status, refill, cancel, balance, services, invalid_key
  success: { type: Boolean, default: true, index: true },
  errorMessage: { type: String, default: null },
  ip: { type: String },
  durationMs: { type: Number },
  createdAt: { type: Date, default: Date.now },
});

// Auto-expire logs after 60 days so this collection doesn't grow forever
apiLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 60 });
apiLogSchema.index({ createdAt: -1 });

export default mongoose.model("ApiLog", apiLogSchema);
