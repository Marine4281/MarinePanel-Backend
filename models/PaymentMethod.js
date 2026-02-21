import mongoose from "mongoose";

const paymentMethodSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true }, // e.g., "Card (Visa / Mastercard / Verve)"
    type: { type: String, required: true, enum: ["card", "mpesa", "bank", "manual"] },
    minDeposit: { type: Number, required: true, default: 0, min: 0 },
    description: { type: String, trim: true }, // Instructions, e.g., "Go to Home → Support"
    isVisible: { type: Boolean, default: true }, // Show/hide for users
  },
  { timestamps: true }
);

export default mongoose.model("PaymentMethod", paymentMethodSchema);
