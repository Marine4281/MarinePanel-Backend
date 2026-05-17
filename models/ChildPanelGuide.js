// models/ChildPanelGuide.js
import mongoose from "mongoose";

const childPanelGuideSchema = new mongoose.Schema(
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

    // Where this guide should appear:
    // activation = child panel activation/landing page
    // dashboard  = child panel owner's dashboard
    // both       = both locations
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

export default mongoose.models.ChildPanelGuide ||
  mongoose.model("ChildPanelGuide", childPanelGuideSchema);
