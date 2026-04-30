//models/ProviderProfile.js
import mongoose from "mongoose";

const providerProfileSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    apiUrl: {
      type: String,
      required: true,
      trim: true,
    },

    apiKey: {
      type: String,
      required: true,
      trim: true,
    },

    cpOwner: { 
      type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true }
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("ProviderProfile", providerProfileSchema);
