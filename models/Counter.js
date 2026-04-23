//models/Counter.js
import mongoose from "mongoose";

const counterSchema = new mongoose.Schema({
  _id: {
    type: String,
    required: false, // 🔥 allow service counters
  },

  id: {
    type: String,
    required: false, // 🔥 allow order counters
    index: true,
  },

  seq: {
    type: Number,
    default: 1000,
  },
});

export default mongoose.model("Counter", counterSchema);
