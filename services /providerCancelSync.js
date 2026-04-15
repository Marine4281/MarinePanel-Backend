import Order from "../models/Order.js";
import ProviderProfile from "../models/ProviderProfile.js";
import { callProvider } from "../utils/providerApi.js";

/**
 * 🔄 Sync cancel requests from provider
 * (safe + fallback-based system)
 */
export const syncProviderCancels = async () => {
  try {
    // 🔍 Get active cancel requests
    const orders = await Order.find({
      cancelRequested: true,
      cancelStatus: { $in: ["pending", "processing"] },
    });

    if (!orders.length) {
      console.log("✅ No cancel jobs to sync");
      return;
    }

    console.log(`🔄 Syncing ${orders.length} cancel requests...`);

    // 🧠 Group by providerProfileId
    const grouped = {};

    for (const order of orders) {
      if (!order.providerProfileId) continue;

      const key = order.providerProfileId.toString();

      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(order);
    }

    // 🔁 Process each provider
    for (const providerProfileId of Object.keys(grouped)) {
      const providerOrders = grouped[providerProfileId];

      const profile = await ProviderProfile.findById(providerProfileId);

      if (!profile) {
        console.warn(`⚠️ Provider not found: ${providerProfileId}`);
        continue;
      }

      const orderIds = providerOrders
        .map((o) => o.providerOrderId)
        .filter(Boolean)
        .join(",");

      if (!orderIds) continue;

      try {
        /**
         * ⚠️ NOTE:
         * Most providers do NOT return cancel status polling.
         * So we rely on request success + assume cancellation.
         */
        const response = await callProvider(profile, {
          action: "cancel",
          orders: orderIds,
        });

        // 🔁 Normalize response
        const dataArray = Array.isArray(response)
          ? response
          : Object.values(response);

        for (const order of providerOrders) {
          const result = dataArray.find(
            (r) => String(r.order) === String(order.providerOrderId)
          );

          let updated = false;

          // 🧠 If provider explicitly confirms cancel
          if (result?.cancel === 1 || result?.cancel === true) {
            if (order.cancelStatus !== "success") {
              order.cancelStatus = "success";
              order.cancelProcessed = true;
              order.status = "cancelled";
              updated = true;
            }
          }

          // ❌ If provider returns error
          if (result?.cancel?.error) {
            if (order.cancelStatus !== "failed") {
              order.cancelStatus = "failed";
              order.cancelProcessed = true;
              updated = true;
            }
          }

          // 🕒 Safety timeout fallback (important)
          const hoursSince =
            (Date.now() - new Date(order.cancelRequestedAt || order.createdAt)) /
            3600000;

          if (hoursSince > 24 && order.cancelStatus === "pending") {
            order.cancelStatus = "failed";
            order.cancelProcessed = true;
            order.errorMessage = "Cancel timeout (no provider confirmation)";
            updated = true;
          }

          if (updated) {
            await order.save();
          }
        }
      } catch (err) {
        console.error(
          "❌ Cancel provider error:",
          err.response?.data || err.message
        );
      }
    }
  } catch (error) {
    console.error("❌ Cancel sync crash:", error);
  }
};
