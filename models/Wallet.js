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
            "Admin Adjustment",
            "RPA Fee",
            "CP Activation Fee",
            "CP Admin Adjustment",  
            "Commission",            
            "Commission Reversal",   
            "CP Commission",         
            "CP Commission Reversal",
            "Reseller Activation Fee",
            "Platform Reseller Fee",
            "CP Deposit Earning" 
          ],
          required: true,
        },

        amount: { 
          type: Number, 
          required: true 
        },

        status: {
          type: String,
          enum: ["Pending", "Completed", "Failed"],
          default: "Completed",   // ✅ refunds & orders usually complete instantly
        },

        reference: {
          type: String,
          index: true,
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

export default mongoose.model("Wallet", walletSchema);
