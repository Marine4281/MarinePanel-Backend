import mongoose from "mongoose";

const walletSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    balance: { type: Number, default: 0 }, // in USD
    currency: { type: String, default: "USD" },
    transactions: [
      {
        type: {
          type: String,
          enum: ["Deposit", "Withdrawal", "Order", "Admin Adjustment"],
          required: true,
        },
        amount: { type: Number, required: true },
        status: {
          type: String,
          enum: ["Pending", "Completed", "Failed"],
          default: "Pending",
        },
        createdAt: { type: Date, default: Date.now },
        note: { type: String },
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.model("Wallet", walletSchema);