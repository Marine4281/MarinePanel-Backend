import Order from "../models/Order.js";
import ProviderProfile from "../models/ProviderProfile.js";
import { callProvider } from "../utils/providerApi.js";

/**
 * 🔄 Sync refill statuses from provider
 */
export const syncProviderRefills = async () => {
  try {
    // 🔍 Get orders with active refill requests
    const orders = await Order.find({
      refillId: { $ne: null },
      refillStatus: { $in: ["pending", "processing"] },
    });

    if (!orders.length) {
      console.log("✅ No refill jobs to sync");
      return;
    }

    console.log(`🔄 Syncing ${orders.length} refill requests...`);

    // 🧠 Group by provider
    const grouped = {};

    for (const order of orders) {
      const key = order.provider?.toString();

      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(order);
    }

    // 🔁 Process each provider
    for (const providerName of Object.keys(grouped)) {
      const providerOrders = grouped[providerName];

      const profile = await ProviderProfile.findOne({ name: providerName });

      if (!profile) {
        console.warn(`⚠️ Provider not found: ${providerName}`);
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

        // 🔁 Normalize response (array or object)
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

          if (order.refillStatus !== status) {
            order.refillStatus = status;
            updated = true;
          }

          // 🧠 Mark completion states
          if (status === "completed") {
            order.refillCompletedAt = new Date();
            updated = true;
          }

          if (status === "rejected") {
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
