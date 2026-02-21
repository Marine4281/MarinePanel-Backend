import mongoose from "mongoose";

const transactionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: ["Deposit", "Withdrawal"], required: true },
    method: { type: String, required: true }, // e.g., Paystack, Mpesa, Bank
    amount: { type: Number, required: true },
    status: { type: String, enum: ["Pending", "Completed", "Failed"], default: "Pending" },
    reference: { type: String, required: true, unique: true },
    details: { type: Object }, // store provider-specific info
    note: { type: String },
  },
  { timestamps: true }
);

export default mongoose.model("Transaction", transactionSchema);
