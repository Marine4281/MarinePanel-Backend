// models/CPCategoryMeta.js
// Per-CP-owner category metadata (sort order, featured, featured colour)

import mongoose from "mongoose";

const cpCategoryMetaSchema = new mongoose.Schema(
  {
    cpOwner: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "User",
      required: true,
      index:    true,
    },
    platform:  { type: String, required: true, trim: true },
    category:  { type: String, required: true, trim: true },
    sortOrder: { type: Number, default: 999 },
    isFeatured:    { type: Boolean, default: false },
    featuredColor: { type: String, enum: ["orange", "blue"], default: "orange" },
  },
  { timestamps: true }
);

// One entry per (cpOwner, platform, category) combo
cpCategoryMetaSchema.index(
  { cpOwner: 1, platform: 1, category: 1 },
  { unique: true }
);

export default mongoose.model("CPCategoryMeta", cpCategoryMetaSchema);
