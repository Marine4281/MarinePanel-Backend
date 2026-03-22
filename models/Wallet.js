// models/Wallet.js
import mongoose from "mongoose";

const walletSchema = new mongoose.Schema(
  {
    user: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User", 
      required: true 
    },

    balance: { 
      type: Number, 
      default: 0 
    }, // in USD

    currency: { 
      type: String, 
      default: "USD" 
    },

    transactions: [
      {
        type: {
          type: String,
          enum: [
            "Deposit",
            "Withdrawal",
            "Order",
            "Refund",          
            "Admin Adjustment"
          ],
          required: true,
          set: (v) => {
            if (!v) return v;
            // Capitalize each word to match enum
            return v
              .toLowerCase()
              .split(" ")
              .map(word => word.charAt(0).toUpperCase() + word.slice(1))
              .join(" ");
          },
        },

        amount: { 
          type: Number, 
          required: true 
        },

        status: {
          type: String,
          enum: ["Pending", "Completed", "Failed"],
          default: "Completed",
          set: (v) => {
            if (!v) return v;
            return v.charAt(0).toUpperCase() + v.slice(1).toLowerCase();
          },
        },

        createdAt: { 
          type: Date, 
          default: Date.now 
        },

        note: { 
          type: String 
        },
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.models.Wallet || mongoose.model("Wallet", walletSchema);
