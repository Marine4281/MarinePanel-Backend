import mongoose from "mongoose";

const transactionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: ["Deposit", "Withdrawal"], required: true },
    method: { type: String, required: true },
    amount: { type: Number, required: true },
    status: { type: String, enum: ["Pending", "Completed", "Failed"], default: "Pending" },
    reference: { type: String, required: true, unique: true },
    details: { type: Object },
    note: { type: String },


    gateway:       { type: mongoose.Schema.Types.ObjectId, ref: "PaymentGateway", default: null },
   provider:      { type: String, default: "" },
   localAmount:   { type: Number, default: 0 },   // what provider charged in local currency
   localCurrency: { type: String, default: "USD" },

    /*
    ================================================================
    CHILD PANEL SYSTEM
    ================================================================
    */

    // Which child panel does this transaction belong to?
    // null  = transaction on main platform or platform reseller
    // ObjId = transaction made on a child panel's domain
    childPanelOwner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    // When childPanelPaymentMode is 'platform':
    // deposit hits main Paystack → we credit child panel owner wallet
    // this flag tracks whether that credit has been done
    childPanelCredited: {
      type: Boolean,
      default: false,
      index: true,
    },

    // When the gateway used is isPlatformConnected (CP is riding on the
    // platform's own processor, not their own credentials):
    // withdrawal request → we debit the CP owner's wallet too (they're the
    // one whose earned balance is actually backing this payout).
    // This flag tracks whether that debit was made, so complete/refund
    // know whether there's a matching CP-side ledger entry to sync.
    childPanelDebited: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Transaction", transactionSchema);
