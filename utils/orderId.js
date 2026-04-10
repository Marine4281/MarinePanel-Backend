// utils/orderId.js

import Counter from "../models/Counter.js";

/**
 * Generate next Order ID (1001, 1002, 1003...)
 */
export const getNextOrderId = async () => {
  try {
    const counter = await Counter.findOneAndUpdate(
      { id: "orderId" },          // 🔑 match your field name
      { $inc: { seq: 1 } },       // 🔑 increment seq
      { new: true, upsert: true } // create if not exists
    );

    return counter.seq; // already starts from 1001

  } catch (error) {
    console.error("Error generating Order ID:", error);
    throw new Error("Failed to generate Order ID");
  }
};
