import Order from "../models/Order.js";

/**
 * Universal provider status normalizer
 * Works with ANY provider wording
 */
const normalizeStatus = (providerStatus = "") => {
  const s = providerStatus.toLowerCase().trim();

  if (["pending", "waiting"].includes(s)) return "pending";

  if (
    ["processing", "in progress", "inprogress", "partial", "running"].includes(
      s
    )
  )
    return "processing";

  if (["completed", "complete", "done", "success"].includes(s))
    return "completed";

  if (["cancelled", "canceled"].includes(s))
    return "cancelled";

  if (["failed", "fail", "error"].includes(s))
    return "failed";

  if (["refunded", "refund"].includes(s))
    return "refunded";

  return "pending"; // safe fallback
};

export const smmWebhook = async (req, res) => {
  try {
    console.log("📩 Webhook received:", req.body);

    // Detect provider order ID dynamically
    const providerOrderId =
      req.body.order ||
      req.body.order_id ||
      req.body.id;

    if (!providerOrderId) {
      return res.status(400).json({
        message: "Missing provider order ID",
      });
    }

    // Find order using providerOrderId (NOT your internal orderId)
    const order = await Order.findOne({ providerOrderId });

    if (!order) {
      console.log("❌ Order not found:", providerOrderId);
      return res.status(404).json({
        message: "Order not found",
      });
    }

    const providerStatus = req.body.status || "";

    order.status = normalizeStatus(providerStatus);
    order.providerStatus = providerStatus;

    if (req.body.quantityDelivered !== undefined) {
      order.quantityDelivered = req.body.quantityDelivered;
    }

    await order.save();

    const io = req.app.get("io");

    if (io) {
      io.emit("order:update", {
        _id: order._id,
        orderId: order.orderId,
        status: order.status,
        providerStatus: order.providerStatus,
        quantity: order.quantity,
        quantityDelivered: order.quantityDelivered,
        charge: order.charge,
      });
    }

    console.log("✅ Order updated:", order.orderId);

    res.status(200).json({ message: "Webhook processed successfully" });
  } catch (error) {
    console.error("🚨 Webhook error:", error);
    res.status(500).json({ message: "Webhook failed" });
  }
};
