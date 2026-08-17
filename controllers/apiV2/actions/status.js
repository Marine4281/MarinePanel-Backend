import Order from "../../../models/Order.js";
import { formatProviderStatusDisplay } from "../../../utils/providerStatusMapper.js";
import { buildOrderQuery, buildMultiOrderQuery } from "../helpers/orderQuery.js";

export const handleStatus = async (req, res, user) => {
  if (req.body.orders) {
    const ids = req.body.orders.toString().split(",").map((id) => id.trim());
    const orders = await Order.find(buildMultiOrderQuery(user._id, ids));
    const response = {};

    ids.forEach((id) => {
      const order = orders.find(
        (o) => o.customOrderId?.toString() === id || o.orderId === id
      );

      if (!order) {
        response[id] = { error: "Incorrect order ID" };
      } else {
        response[id] = {
          charge: order.charge,
          start_count: 0,
          status: formatProviderStatusDisplay(order),
          remains: order.quantity - (order.quantityDelivered || 0),
          currency: "USD",
        };
      }
    });

    return res.json(response);
  }

  if (!req.body.order) {
    return res.json({ error: "Order ID required" });
  }

  const order = await Order.findOne(
    buildOrderQuery(user._id, req.body.order)
  );

  if (!order) {
    return res.json({ error: "Incorrect order ID" });
  }

  return res.json({
    charge: order.charge,
    start_count: 0,
    status: formatProviderStatusDisplay(order),
    remains: order.quantity - (order.quantityDelivered || 0),
    currency: "USD",
  });
};
