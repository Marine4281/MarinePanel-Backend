// models/Currency.js
import mongoose from "mongoose";

const currencySchema = new mongoose.Schema(
  {
    // ─── OWNERSHIP ───────────────────────────────────────────
    // null   = main platform currency
    // ObjId  = belongs to this child panel owner's own list
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    // ─── CURRENCY IDENTITY ───────────────────────────────────
    name:   { type: String, required: true, trim: true },   // e.g. "Kenyan Shilling"
    code:   { type: String, required: true, trim: true, uppercase: true }, // e.g. "KES"
    symbol: { type: String, required: true, trim: true },   // e.g. "KSh"

    // ─── CONVERSION ──────────────────────────────────────────
    // Display-only. 1 USD = rate <this currency>. Real balances/orders
    // always stay stored and calculated in USD.
    rate: { type: Number, required: true, min: 0 },

    // ─── CONTROLS ────────────────────────────────────────────
    isDefault: { type: Boolean, default: false }, // pre-selected for new users
    isActive:  { type: Boolean, default: true  },
  },
  { timestamps: true }
);

currencySchema.index({ owner: 1, code: 1 }, { unique: true });

export default mongoose.model("Currency", currencySchema);
