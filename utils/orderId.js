// utils/orderId.js
import Counter from "../models/Counter.js";

export const getNextOrderId = async () => {
  try {
    const counter = await Counter.findOneAndUpdate(
      { _id: "orderId" },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );

    return counter.seq; // ✅ clean sequential ID
  } catch (error) {
    console.error("Error generating Order ID:", error);
    throw new Error("Failed to generate Order ID");
  }
};
