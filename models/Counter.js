import mongoose from "mongoose";

const counterSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
  },
  seq: {
    type: Number,
    default: 1000, // services will start from 1001
  },
});

export default mongoose.model("Counter", counterSchema);
