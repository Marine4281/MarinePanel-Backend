import mongoose from "mongoose";

const settingsSchema = new mongoose.Schema(
  {
    commission: { type: Number, default: 50 }, // Default 50%
    totalRevenue: { type: Number, default: 0 }, // Total revenue counter
  },
  { timestamps: true }
);

export default mongoose.models.Settings || mongoose.model("Settings", settingsSchema);