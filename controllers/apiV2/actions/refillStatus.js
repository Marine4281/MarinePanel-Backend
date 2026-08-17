import Order from "../../../models/Order.js";
import { formatRefillStatus } from "../helpers/statusFormat.js";

export const handleRefillStatus = async (req, res, user) => {
  const getRefillStatus = async (refillId) => {
    const str = refillId?.toString().trim();
    const num = !isNaN(str) && str !== "" ? Number(str) : null;

    const order = await Order.findOne({
      $and: [
        { $or: [{ userId: user._id }, { endUserId: user._id }] },
        {
          $or: [
            { refillId: str },
            ...(num !== null ? [{ customOrderId: num }] : []),
            { orderId: str },
          ],
        },
      ],
    });

    if (!order || !order.refillRequested) {
      return { error: "Refill not found" };
    }

    return formatRefillStatus(order.refillStatus);
  };

  if (req.body.refills) {
    const ids = req.body.refills.toString().split(",").map((id) => id.trim());
    const results = [];

    for (const id of ids) {
      const status = await getRefillStatus(id);
      results.push({ refill: id, status });
    }

    return res.json(results);
  }

  if (!req.body.refill) {
    return res.json({ error: "Refill ID required" });
  }

  const status = await getRefillStatus(req.body.refill.toString().trim());

  if (typeof status === "object") {
    return res.json(status);
  }

  return res.json({ status });
};
