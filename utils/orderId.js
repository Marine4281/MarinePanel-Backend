// utils/orderId.js

import Counter from "../models/Counter.js";

/**
 * Generate next Order ID (1001, 1002, 1003...)
 */
export const getNextOrderId = async () => {
  try {
    const counter = await Counter.findOneAndUpdate(
      { id: "orderId" },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );

    // 🔥 FIX: start from 1001
    return 1206 + counter.seq;

  } catch (error) {
    console.error("Error generating Order ID:", error);
    throw new Error("Failed to generate Order ID");
  }
};
