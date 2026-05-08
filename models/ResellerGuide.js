import mongoose from "mongoose";

const resellerGuideSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },

    content: {
      type: String,
      required: true,
      trim: true,
    },

    order: {
      type: Number,
      default: 0,
    },

    visible: {
      type: Boolean,
      default: true,
    },

    // Where this guide should appear
    placement: {
      type: String,
      enum: ["activation", "dashboard", "both"],
      default: "activation",
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.models.ResellerGuide ||
  mongoose.model("ResellerGuide", resellerGuideSchema);
