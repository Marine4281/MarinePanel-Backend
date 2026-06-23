// models/ResellerActivationEvent.js
import mongoose from "mongoose";

const resellerActivationEventSchema = new mongoose.Schema(
  {
    childPanelOwner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    reseller:        { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    resellerEmail:   { type: String, required: true },

    type: {
      type: String,
      enum: ["success", "pending", "resumed"],
      required: true,
    },

    cpFeeCharged:       { type: Number, default: 0 }, // the reseller's own fee, FYI display
    platformFeeCharged: { type: Number, default: 0 }, // the anti-abuse fee, FYI display

    message: { type: String, required: true },

    seen: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

resellerActivationEventSchema.index({ childPanelOwner: 1, seen: 1 });

export default mongoose.model("ResellerActivationEvent", resellerActivationEventSchema);
