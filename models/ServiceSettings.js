import mongoose from "mongoose";

const serviceSettingsSchema = new mongoose.Schema(
  {
    globalRefillEnabled: {
      type: Boolean,
      default: true,
    },
    globalCancelEnabled: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model("ServiceSettings", serviceSettingsSchema);
