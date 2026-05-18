import mongoose from "mongoose";

const providerProfileSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      // ✅ FIXED: removed unique: true here — the field-level unique was
      // creating a separate name_1 index that blocked CP owners from using
      // any provider name already taken on the main platform.
      // Uniqueness is now enforced ONLY by the compound index below.
      trim: true,
    },
    apiUrl: { type: String, required: true, trim: true },
    apiKey: { type: String, required: true, trim: true },
    cpOwner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

// Unique per (name + cpOwner scope) — main platform and each CP are independent
providerProfileSchema.index({ name: 1, cpOwner: 1 }, { unique: true });

export default mongoose.model("ProviderProfile", providerProfileSchema);
