import Order from "../../../models/Order.js";
import { buildOrderQuery } from "../helpers/orderQuery.js";

export const handleRefill = async (req, res, user) => {
  const processRefill = async (id) => {
    const order = await Order.findOne(buildOrderQuery(user._id, id));

    if (!order) return { error: "Incorrect order ID" };
    if (!order.refillAllowed) return { error: "Refill not allowed" };
    if (order.status !== "completed" && order.status !== "partial") {
      return { error: "Order not eligible for refill" };
    }
    if (order.refillRequested && !order.refillProcessed) {
      return { error: "Refill already in progress" };
    }

    order.refillRequested = true;
    order.refillRequestedAt = new Date();
    order.refillStatus = "pending";
    order.refillProcessed = false;

    await order.save();

    return order.refillId || order.customOrderId || order.orderId;
  };

  if (req.body.orders) {
    const ids = req.body.orders.toString().split(",").map((id) => id.trim());
    const results = [];

    for (const id of ids) {
      const result = await processRefill(id);
      results.push({ order: id, refill: result });
    }

    return res.json(results);
  }

  if (!req.body.order) {
    return res.json({ error: "Order ID required" });
  }

  const result = await processRefill(req.body.order.toString().trim());

  if (typeof result === "object") {
    return res.json(result);
  }

  return res.json({ refill: result });
};
