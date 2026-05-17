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

    placement: {
      type: String,
      enum: ["activation", "dashboard", "both"],
      default: "activation",
    },

    // null = admin-created (shown to all resellers on main platform)
    // ObjectId = CP owner-created (shown only to their resellers)
    cpOwner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.models.ResellerGuide ||
  mongoose.model("ResellerGuide", resellerGuideSchema);
