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

    // 🟣 Provider Info
    provider: {
      type: String,
      required: true,
      trim: true,
    },

    providerApiUrl: {
      type: String,
      default: "",
    },

    providerServiceId: {
      type: String,
      default: "",
    },

    providerApiKey: {
      type: String,
      default: "",
    },

    // 💰 Pricing (per 1000)
    rate: {
      type: Number,
      required: true,
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
    // 🎁 FREE SERVICE SYSTEM (Cooldown Based)
    // =====================================================

    isFree: {
      type: Boolean,
      default: false,
      index: true,
    },

    // Max quantity allowed when free
    freeQuantity: {
      type: Number,
      default: 0,
    },

    /*
      Cooldown Rules:
      -1  → One time ever
       24 → Every 24 hours
       168 → Weekly
       720 → Monthly
       0 → Unlimited free (NOT recommended)
    */
    cooldownHours: {
      type: Number,
      default: 0,
    },

    // =====================================================

    // 📝 Optional Info
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

    // ⭐ Default Service inside Category
    isDefault: {
      type: Boolean,
      default: false,
      index: true,
    },

    // 🌍 One Global Default Category
    isDefaultCategoryGlobal: {
      type: Boolean,
      default: false,
      index: true,
    },

    // 🎯 One Default Category per Platform
    isDefaultCategoryPlatform: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

// 🚀 Compound Indexes
serviceSchema.index({ platform: 1, category: 1 });
serviceSchema.index({ platform: 1, isDefaultCategoryPlatform: 1 });

export default mongoose.model("Service", serviceSchema);
