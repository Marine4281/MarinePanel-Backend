// utils/orderId.js

import Counter from "../models/Counter.js";

/**
 * Generate next custom Order ID (1001, 1002, 1003...)
 */
export const getNextOrderId = async () => {
  try {
    const counter = await Counter.findOneAndUpdate(
      { name: "orderId" },           // unique counter name
      { $inc: { value: 1 } },       // increment by 1
      { new: true, upsert: true }   // create if not exists
    );

    // Start from 1001
    return 1000 + counter.value;

  } catch (error) {
    console.error("Error generating Order ID:", error);
    throw new Error("Failed to generate Order ID");
  }
};
