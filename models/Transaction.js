import mongoose from "mongoose";

const TransactionSchema = new mongoose.Schema({
  amount: Number,
  status: String,
});

const Transaction = mongoose.model("Transaction", TransactionSchema);

export default Transaction;
