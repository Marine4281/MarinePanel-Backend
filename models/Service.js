import mongoose from "mongoose";

const serviceSchema = new mongoose.Schema(
  {
    category: { type: String, required: true },           // Instagram, TikTok, YouTube, etc.
    name: { type: String, required: true },               // e.g., Followers, Likes
    provider: { type: String, required: true },           // Provider Name
    providerApiUrl: { type: String, default: "" },        // API URL
    providerServiceId: { type: String, default: "" },     // Service ID on provider
    providerApiKey: { type: String, default: "" },        // API Key if needed
    rate: { type: Number, required: true },               // price per unit
    min: { type: Number, default: 1 },                    // minimum order
    max: { type: Number, default: 100000 },               // maximum order
    status: { type: Boolean, default: true },             // active or not
    description: { type: String, default: "" },           // optional description for service
    refillAllowed: { type: Boolean, default: true },      // allow refill
    cancelAllowed: { type: Boolean, default: true },      // allow cancel
    isDefault: { type: Boolean, default: false },         // make default service
  },
  { timestamps: true }
);

export default mongoose.model("Service", serviceSchema);