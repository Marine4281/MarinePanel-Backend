import mongoose from "mongoose";

const paymentMethodSchema = new mongoose.Schema({
  name: { type: String, required: true }, // e.g., "Card (Visa / Mastercard / Verve)"
  type: { type: String, required: true }, // "Card", "Mobile Money", "Bank", "Manual"
  minDeposit: { type: Number, required: true },
  description: { type: String }, // Instructions, e.g., "Go to Home → Support"
  isVisible: { type: Boolean, default: true }, // Show/hide for users
  providerAPI: {
    providerName: { type: String },
    apiUrl: { type: String },
    apiKey: { type: String },
    serviceId: { type: String },
  },
}, { timestamps: true });

export default mongoose.model("PaymentMethod", paymentMethodSchema);