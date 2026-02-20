// controllers/smmWebhookController.js
import Order from "../models/Order.js";

// Map only your internal enum
const statusMap = {
  pending: "pending",
  processing: "processing",
  completed: "completed",
  cancelled: "cancelled",
  refunded: "refunded",
};

export const smmWebhook = async (req, res) => {
  try {
    const { orderId, status: providerStatus, quantityDelivered } = req.body;

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Order not found" });

    // Normalize status simply
    const status =
      statusMap[providerStatus?.toLowerCase()] ||
      providerStatus?.toLowerCase();

    // Update directly
    order.status = status;

    if (quantityDelivered !== undefined) order.quantityDelivered = quantityDelivered;

    await order.save();

    // Emit live update to dashboard
    const io = req.app.get("io");
    if (io) {
      io.emit("order:update", {
        orderId: order._id,
        status: order.status,
        quantityDelivered: order.quantityDelivered,
      });
    }

    res.status(200).json({ message: "Status updated successfully" });
  } catch (err) {
    console.error("SMM Webhook Error:", err);
    res.status(500).json({ message: "Webhook failed" });
  }
};
