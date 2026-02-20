// controllers/smmWebhookController.js
import Order from "../models/Order.js";

// Allowed status transitions
const allowedTransitions = {
  pending: ["processing", "failed"],
  processing: ["completed", "failed"],
  completed: [],
  failed: [],
};

// Optional: map provider statuses to internal statuses
const statusMap = {
  1: "pending",
  2: "processing",
  3: "completed",
  4: "failed",
};

export const smmWebhook = async (req, res) => {
  try {
    // 1️⃣ Verify secret (optional but recommended)
    const secret = req.headers["x-smm-secret"];
    if (secret !== process.env.SMM_WEBHOOK_SECRET) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { orderId, status: providerStatus, quantityDelivered } = req.body;

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Order not found" });

    // 2️⃣ Map provider status to internal status
    const status = statusMap[providerStatus] || providerStatus;

    // 3️⃣ Validate transition
    if (
      order.status &&
      !allowedTransitions[order.status].includes(status) &&
      order.status !== status
    ) {
      return res.status(400).json({ message: "Invalid status transition" });
    }

    // 4️⃣ Update order
    order.status = status;
    if (quantityDelivered !== undefined) order.quantityDelivered = quantityDelivered;

    // 5️⃣ Track progress history
    if (!order.progressHistory) order.progressHistory = [];
    order.progressHistory.push({
      status,
      timestamp: new Date(),
      quantityDelivered: quantityDelivered || order.quantityDelivered,
    });

    await order.save();

    // 6️⃣ Emit socket event for live updates
    const io = req.app.get("io");
    if (io) {
      io.emit("order:update", {
        orderId: order._id,
        status,
        quantityDelivered: order.quantityDelivered,
      });
    }

    res.status(200).json({ message: "Webhook received" });
  } catch (err) {
    console.error("SMM Webhook Error:", err);
    res.status(500).json({ message: "Webhook failed" });
  }
};
