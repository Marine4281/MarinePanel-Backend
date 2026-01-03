// controllers/smmWebhookController.js
import Order from "../models/Order.js";

export const smmWebhook = async (req, res) => {
  try {
    const { orderId, status, quantityDelivered } = req.body;

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Order not found" });

    order.status = status;
    if (quantityDelivered) order.quantityDelivered = quantityDelivered;
    await order.save();

    // Optional: emit socket event to update dashboard
    const io = req.app.get("io");
    if (io) {
      io.emit("order:update", { orderId: order._id, status });
    }

    res.json({ message: "Webhook received" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Webhook failed" });
  }
};