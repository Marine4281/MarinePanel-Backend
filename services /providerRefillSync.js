// services/providerRefillSync.js

import Order from "../models/Order.js";
import ProviderProfile from "../models/ProviderProfile.js";
import { callProvider } from "../utils/providerApi.js";

/**
 * 🔄 Sync refill statuses from provider (PRODUCTION SAFE)
 */
export const syncProviderRefills = async () => {
  try {
    // 🔍 Get active refill orders
    const orders = await Order.find({
      refillId: { $exists: true, $ne: null },
      refillStatus: { $in: ["pending", "processing"] },
    });

    if (!orders.length) {
      console.log("✅ No refill jobs to sync");
      return;
    }

    console.log(`🔄 Syncing ${orders.length} refill requests...`);

    // 🧠 Group by providerProfileId (FIXED)
    const grouped = {};

    for (const order of orders) {
      if (!order.providerProfileId) continue;

      const key = order.providerProfileId.toString();

      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(order);
    }

    // 🔁 Process each provider profile
    for (const providerProfileId of Object.keys(grouped)) {
      const providerOrders = grouped[providerProfileId];

      const profile = await ProviderProfile.findById(providerProfileId);

      if (!profile) {
        console.warn(`⚠️ ProviderProfile not found: ${providerProfileId}`);
        continue;
      }

      const refillIds = providerOrders
        .map((o) => o.refillId)
        .filter(Boolean)
        .join(",");

      if (!refillIds) continue;

      try {
        const response = await callProvider(profile, {
          action: "refill_status",
          refills: refillIds,
        });

        // 🔁 Normalize response (array OR object)
        const dataArray = Array.isArray(response)
          ? response
          : Object.values(response);

        for (const order of providerOrders) {
          const refillData = dataArray.find(
            (r) => String(r.refill) === String(order.refillId)
          );

          if (!refillData) continue;

          const status = String(refillData.status || "").toLowerCase();

          let updated = false;

          // 🔄 status update
          if (order.refillStatus !== status) {
            order.refillStatus = status;
            updated = true;
          }

          // 🧠 lifecycle timestamps
          if (status === "completed" && !order.refillCompletedAt) {
            order.refillCompletedAt = new Date();
            updated = true;
          }

          if (status === "rejected" && !order.refillRejectedAt) {
            order.refillRejectedAt = new Date();
            updated = true;
          }

          if (updated) {
            await order.save();
          }
        }

      } catch (err) {
        console.error(
          "❌ Refill provider error:",
          err.response?.data || err.message
        );
      }
    }

  } catch (error) {
    console.error("❌ Refill sync crash:", error);
  }
};
