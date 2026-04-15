// controllers/orderActionController.js

import Order from "../models/Order.js";
import ProviderProfile from "../models/ProviderProfile.js";
import { callProvider } from "../utils/providerApi.js";

/* =========================================================
   🔧 HELPER: GET PROVIDER (CLEAN & SAFE)
========================================================= */
const getProvider = async (order) => {
  if (!order.providerProfileId) return null;

  return await ProviderProfile.findById(order.providerProfileId);
};

/* =========================================================
   CANCEL ORDER
========================================================= */
export const cancelOrder = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (order.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    if (order.cancelRequested) {
      return res.status(400).json({ message: "Cancel already requested" });
    }

    if (order.status === "completed") {
      return res.status(400).json({ message: "Cannot cancel completed order" });
    }

    if (!order.cancelAllowed) {
      return res.status(400).json({
        message: "Cancel not supported for this service",
      });
    }

    const provider = await getProvider(order);

    if (!provider) {
      return res.status(400).json({
        message: "Provider not found (invalid providerProfileId on order)",
      });
    }

    const response = await callProvider(provider, {
      action: "cancel",
      orders: order.providerOrderId?.toString(),
    });

    order.cancelRequested = true;
    order.cancelRequestedAt = new Date();
    order.cancelStatus = "pending";
    order.cancelProcessed = false;
    order.cancelResponse = response;

    await order.save();

    res.json({
      message: "Cancel request sent",
      response,
    });

  } catch (error) {
    console.error("Cancel Order Error:", error);
    res.status(500).json({
      message: "Cancel request failed",
      error: error.message,
    });
  }
};

/* =========================================================
   REFILL ORDER
========================================================= */
export const refillOrder = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (order.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    if (order.refillRequested) {
      return res.status(400).json({ message: "Refill already requested" });
    }

    if (order.status === "cancelled") {
      return res.status(400).json({
        message: "Cannot refill cancelled order",
      });
    }

    if (!["completed", "partial"].includes(order.status)) {
      return res.status(400).json({
        message: "Order not eligible for refill",
      });
    }

    if (!order.refillAllowed) {
      return res.status(400).json({
        message: "Refill not supported for this service",
      });
    }

    const provider = await getProvider(order);

    if (!provider) {
      return res.status(400).json({
        message: "Provider not found (invalid providerProfileId on order)",
      });
    }

    const response = await callProvider(provider, {
      action: "refill",
      order: order.providerOrderId?.toString(),
    });

    order.refillRequested = true;
    order.refillRequestedAt = new Date();
    order.refillStatus = "pending";
    order.refillResponse = response;

    order.providerRefillId =
      response?.refill || response?.data?.refill || null;

    await order.save();

    res.json({
      message: "Refill request sent",
      response,
    });

  } catch (error) {
    console.error("Refill Order Error:", error);
    res.status(500).json({
      message: "Refill request failed",
      error: error.message,
    });
  }
};
