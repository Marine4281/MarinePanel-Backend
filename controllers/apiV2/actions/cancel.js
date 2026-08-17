import Order from "../../../models/Order.js";
import ProviderProfile from "../../../models/ProviderProfile.js";
import { callProvider } from "../../../utils/providerApi.js";
import { buildOrderQuery } from "../helpers/orderQuery.js";
import { processCancelRefund, extractCancelResult } from "../helpers/cancelRefund.js";

export const handleCancel = async (req, res, user) => {
  if (!req.body.orders) {
    return res.json({ error: "Order IDs required" });
  }

  const ids = req.body.orders.toString().split(",").map((id) => id.trim());
  const results = {};

  const eligibleOrders = [];

  for (const id of ids) {
    const order = await Order.findOne(buildOrderQuery(user._id, id));

    if (!order) {
      results[id] = { error: "Incorrect order ID" };
      continue;
    }

    if (!order.cancelAllowed) {
      results[id] = { error: "Cancel not allowed" };
      continue;
    }

    if (["completed", "cancelled", "refunded"].includes(order.status)) {
      results[id] = { error: "Order cannot be cancelled" };
      continue;
    }

    const providerOrderId = String(order.providerOrderId || "").trim();
    if (!providerOrderId) {
      results[id] = { error: "Invalid provider order ID" };
      continue;
    }

    eligibleOrders.push({ id, order, providerOrderId });
  }

  const grouped = {};
  for (const entry of eligibleOrders) {
    const key = String(entry.order.providerProfileId || "");
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(entry);
  }

  for (const profileId of Object.keys(grouped)) {
    const group = grouped[profileId];
    const providerProfile = await ProviderProfile.findById(profileId);

    if (!providerProfile || !providerProfile.apiUrl || !providerProfile.apiKey) {
      for (const { id } of group) {
        results[id] = { error: "Provider not configured" };
      }
      continue;
    }

    let providerResponse;
    try {
      providerResponse = await callProvider(providerProfile, {
        action: "cancel",
        orders: group.map((g) => g.providerOrderId).join(","),
      });
    } catch (err) {
      console.error("Batch cancel provider error:", err);
      for (const { id } of group) {
        results[id] = { error: "Provider request failed" };
      }
      continue;
    }

    for (const { id, order, providerOrderId } of group) {
      const cancelResult = extractCancelResult(providerResponse, providerOrderId);
      const isSuccess = cancelResult === 1 || cancelResult === true;

      order.cancelRequested = true;
      order.cancelRequestedAt = new Date();
      order.cancelStatus = isSuccess ? "success" : "failed";
      order.cancelProcessed = true;
      order.cancelResponse = providerResponse;

      if (isSuccess) {
        order.status = "cancelled";
      }

      await order.save();

      if (isSuccess) {
        await processCancelRefund(order);
        results[id] = 1;
      } else {
        results[id] = { error: "Cancel request failed" };
      }
    }
  }

  return res.json(
    ids.map((id) => ({ order: id, cancel: results[id] ?? { error: "Cancel not processed" } }))
  );
};
