//models/ProviderService.js
import mongoose from "mongoose";

const providerServiceSchema = new mongoose.Schema(
  {
    provider: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },

    providerServiceId: {
      type: Number,
      required: true,
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    cpOwner: { 
      type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true }

    category: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    rate: {
      type: Number,
      required: true,
      default: 0,
    },

    min: {
      type: Number,
      required: true,
    },

    max: {
      type: Number,
      required: true,
    },

    status: {
      type: Boolean,
      default: true,
      index: true,
    },

    // ✅ NEW: optional description (safe)
    description: {
      type: String,
      default: "",
      trim: true,
    },

    // ✅ NEW: mark if removed from provider API
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },

    // ✅ NEW: last sync timestamp
    lastSyncedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

/*
Prevent duplicate provider services
*/
providerServiceSchema.index(
  { provider: 1, providerServiceId: 1 },
  { unique: true }
);

/*
🔥 Extra performance indexes (safe)
*/
providerServiceSchema.index({ provider: 1, category: 1 });
providerServiceSchema.index({ provider: 1, status: 1 });

const ProviderService = mongoose.model(
  "ProviderService",
  providerServiceSchema
);

export default ProviderService;
