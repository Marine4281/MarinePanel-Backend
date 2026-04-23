// services/providerRefillSync.js

import Order from "../models/Order.js";
import ProviderProfile from "../models/ProviderProfile.js";
import { callProvider } from "../utils/providerApi.js";

/**
 * 🔄 Sync refill statuses from provider (PRODUCTION HARDENED)
 */
export const syncProviderRefills = async () => {
  try {
    /* =========================================================
       🔍 GET ACTIVE REFILLS ONLY
    ========================================================= */

    const orders = await Order.find({
      refillId: { $exists: true, $ne: null },
      refillProcessed: false, // ✅ IMPORTANT
      refillStatus: { $in: ["pending", "processing"] },
    });

    if (!orders.length) {
      console.log("✅ No refill jobs to sync");
      return;
    }

    console.log(`🔄 Syncing ${orders.length} refill requests...`);

    /* =========================================================
       🧠 GROUP BY PROVIDER
    ========================================================= */

    const grouped = {};

    for (const order of orders) {
      if (!order.providerProfileId) continue;

      const key = order.providerProfileId.toString();

      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(order);
    }

    /* =========================================================
       🔁 PROCESS EACH PROVIDER
    ========================================================= */

    for (const providerProfileId of Object.keys(grouped)) {
      const providerOrders = grouped[providerProfileId];

      const profile = await ProviderProfile.findById(providerProfileId);

      if (!profile) {
        console.warn(`⚠️ ProviderProfile not found: ${providerProfileId}`);
        continue;
      }

      const refillIds = providerOrders
        .map((o) => o.refillId)
        .filter(Boolean);

      if (!refillIds.length) continue;

      let response;

      try {
        /* =========================================================
           🚀 CALL PROVIDER (BULK FIRST)
        ========================================================= */

        response = await callProvider(profile, {
          action: "refill_status",
          refills: refillIds.join(","),
        });

      } catch (bulkError) {
        console.warn("⚠️ Bulk refill_status failed, falling back to single");

        // 🔁 fallback to single requests
        for (const order of providerOrders) {
          try {
            const singleRes = await callProvider(profile, {
              action: "refill_status",
              refill: order.refillId,
            });

            await processRefillResponse(order, singleRes);

          } catch (err) {
            console.error(
              `❌ Single refill check failed for ${order.refillId}:`,
              err.message
            );
          }
        }

        continue;
      }

      /* =========================================================
         🔄 NORMALIZE RESPONSE
      ========================================================= */

      let dataArray = [];

      if (Array.isArray(response)) {
        dataArray = response;
      } else if (typeof response === "object") {
        // object keyed OR single object
        dataArray = Object.values(response);
      }

      /* =========================================================
         🔁 MATCH & UPDATE ORDERS
      ========================================================= */

      for (const order of providerOrders) {
        const refillData = dataArray.find(
          (r) => String(r.refill) === String(order.refillId)
        );

        if (!refillData) continue;

        await processRefillResponse(order, refillData);
      }
    }

  } catch (error) {
    console.error("❌ Refill sync crash:", error);
  }
};

/* =========================================================
   🔧 HELPER: PROCESS SINGLE REFILL RESPONSE
========================================================= */
const processRefillResponse = async (order, refillData) => {
  try {
    const status = String(refillData.status || "").toLowerCase();

    if (!status) return;

    let updated = false;

    /* =========================================================
       🔄 STATUS UPDATE
    ========================================================= */

    if (order.refillStatus !== status) {
      order.refillStatus = status;
      updated = true;
    }

    /* =========================================================
       🧠 LIFECYCLE HANDLING
    ========================================================= */

    if (status === "completed") {
      if (!order.refillCompletedAt) {
        order.refillCompletedAt = new Date();
        updated = true;
      }

      order.refillProcessed = true; // ✅ FINAL STATE
    }

    if (status === "rejected" || status === "failed") {
      if (!order.refillRejectedAt) {
        order.refillRejectedAt = new Date();
        updated = true;
      }

      order.refillProcessed = true; // ✅ FINAL STATE
    }

    /* =========================================================
       💾 SAVE IF CHANGED
    ========================================================= */

    if (updated) {
      order.refillResponse = refillData;
      await order.save();

      console.log(
        `✅ Refill updated → Order ${order._id} → ${order.refillStatus}`
      );
    }

  } catch (err) {
    console.error("❌ Refill processing error:", err.message);
  }
};
