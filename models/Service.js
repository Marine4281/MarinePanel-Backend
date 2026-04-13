//models/Service.js
import mongoose from "mongoose";

const serviceSchema = new mongoose.Schema(
  {
    // 🆔 Human Readable Service ID (Auto Increment)
    serviceId: {
      type: Number,
      unique: true,
      index: true,
    },

    // 🔵 Platform (TikTok, Instagram, YouTube...)
    platform: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    // 🟢 Category (Followers, Likes, Views...)
    category: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    // 🟡 Service Name
    name: {
      type: String,
      required: true,
      trim: true,
    },

    // =====================================================
    // 🟣 PROVIDER RELATION (NEW SYSTEM)
    // =====================================================

    // Reference to ProviderProfile
    providerProfileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProviderProfile",
      required: true,
      index: true,
    },

    // Provider name (cached for quick display)
    provider: {
      type: String,
      required: true,
      trim: true,
    },

    // Provider's service ID
    providerServiceId: {
      type: String,
      required: true,
      index: true,
    },

    // =====================================================
    // 💰 PRICING
    // =====================================================

    // Current selling rate (your system rate)
    rate: {
      type: Number,
      required: true,
      default: 0,
    },

    // Last synced provider rate (VERY IMPORTANT 🔥)
    lastSyncedRate: {
      type: Number,
      default: 0,
    },

    // Store previous rate for comparison
    previousRate: {
      type: Number,
      default: 0,
    },

    min: {
      type: Number,
      default: 1,
    },

    max: {
      type: Number,
      default: 100000,
    },

    // =====================================================
    // 🎁 FREE SERVICE SYSTEM
    // =====================================================

    isFree: {
      type: Boolean,
      default: false,
      index: true,
    },

    freeQuantity: {
      type: Number,
      default: 0,
    },

    cooldownHours: {
      type: Number,
      default: 0,
    },

    // =====================================================
    // 📝 OPTIONAL INFO
    // =====================================================

    description: {
      type: String,
      default: "",
    },

    status: {
      type: Boolean,
      default: true,
      index: true,
    },

    refillAllowed: {
      type: Boolean,
      default: true,
    },

    cancelAllowed: {
      type: Boolean,
      default: true,
    },

    /* ===============================
   ❌ CANCEL SYSTEM
=============================== */

cancelRequested: {
  type: Boolean,
  default: false,
  index: true,
},

cancelProcessed: {
  type: Boolean,
  default: false,
  index: true,
},

cancelStatus: {
  type: String,
  enum: ["pending", "processing", "success", "failed"],
  default: null,
},

cancelRequestedAt: {
  type: Date,
  default: null,
},

cancelResponse: {
  type: Object,
  default: null,
},

    // =====================================================
    // ⭐ DEFAULT SETTINGS
    // =====================================================

    isDefault: {
      type: Boolean,
      default: false,
      index: true,
    },

    isDefaultCategoryGlobal: {
      type: Boolean,
      default: false,
      index: true,
    },

    isDefaultCategoryPlatform: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

// =====================================================
// 🚀 INDEXES (IMPORTANT FOR SPEED)
// =====================================================

// Fast lookup for sync (VERY IMPORTANT 🔥)
serviceSchema.index({
  providerProfileId: 1,
  providerServiceId: 1,
});

// Category queries
serviceSchema.index({ platform: 1, category: 1 });
serviceSchema.index({ platform: 1, isDefaultCategoryPlatform: 1 });

export default mongoose.model("Service", serviceSchema);
