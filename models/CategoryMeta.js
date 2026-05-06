import mongoose from "mongoose";

const categoryMetaSchema = new mongoose.Schema(
  {
    platform: { type: String, required: true, trim: true, index: true },
    category: { type: String, required: true, trim: true },
    sortOrder: { type: Number, default: 999 },
    isFeatured: { type: Boolean, default: false },
  },
  { timestamps: true }
);

categoryMetaSchema.index({ platform: 1, category: 1 }, { unique: true });

export default mongoose.model("CategoryMeta", categoryMetaSchema);
