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
    // 🟣 PROVIDER RELATION
    // =====================================================

    providerProfileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProviderProfile",
      required: true,
      index: true,
    },

    provider: {
      type: String,
      required: true,
      trim: true,
    },

    providerServiceId: {
      type: String,
      required: true,
      index: true,
    },

    // =====================================================
    // 💰 PRICING
    // =====================================================

    rate: {
      type: Number,
      required: true,
      default: 0,
    },

    lastSyncedRate: {
      type: Number,
      default: 0,
    },

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

    // =====================================================
    // 🔁 ORDER CONTROLS
    // =====================================================

    refillAllowed: {
      type: Boolean,
      default: true,
    },

    cancelAllowed: {
      type: Boolean,
      default: true,
    },

    /**
     * Refill policy is controlled by YOUR system (not provider)
     * - "none" = no refill
     * - "Xd" = number of days
     * - "lifetime" = unlimited
     * - "custom" = use customRefillDays
     */
    refillPolicy: {
      type: String,
      enum: ["none", "30d", "60d", "90d", "365d", "lifetime", "custom"],
      default: "none",
      index: true,
    },

    customRefillDays: {
      type: Number,
      default: null,
      min: 1,
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
  {
    timestamps: true,
  }
);

// =====================================================
// 🧠 DATA INTEGRITY MIDDLEWARE (CRITICAL)
// =====================================================
serviceSchema.pre("save", function () {
  // 🚫 If refill is disabled → force clean state
  if (!this.refillAllowed) {
    this.refillPolicy = "none";
    this.customRefillDays = null;
  }

  // 🧹 If not custom → remove custom days
  if (this.refillPolicy !== "custom") {
    this.customRefillDays = null;
  }

  // ⚠️ Safety: prevent invalid custom config
  if (this.refillPolicy === "custom" && !this.customRefillDays) {
    this.refillPolicy = "none";
  }

  next();
});

// =====================================================
// 🚀 INDEXES (PERFORMANCE)
// =====================================================

// Fast provider sync lookup
serviceSchema.index({
  providerProfileId: 1,
  providerServiceId: 1,
});

// Fast category queries
serviceSchema.index({ platform: 1, category: 1 });

// Platform defaults
serviceSchema.index({ platform: 1, isDefaultCategoryPlatform: 1 });

// =====================================================
// 📦 EXPORT
// =====================================================
export default mongoose.model("Service", serviceSchema);
