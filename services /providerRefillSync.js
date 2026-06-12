// services/providerRefillSync.js

import Order from "../models/Order.js";
import ProviderProfile from "../models/ProviderProfile.js";
import { callProvider } from "../utils/providerApi.js";

const REFILL_TIMEOUT_MS = 48 * 60 * 60 * 1000;

export const syncProviderRefills = async () => {
  try {
    /* ============================================================
       ⏱️ STEP 1: AUTO-TIMEOUT refills stuck > 48h
    ============================================================ */
    const cutoff = new Date(Date.now() - REFILL_TIMEOUT_MS);

    const timedOut = await Order.updateMany(
      {
        refillId: { $exists: true, $ne: null },
        refillProcessed: false,
        refillStatus: { $in: ["pending", "processing"] },
        refillTimedOut: { $ne: true },
        refillRequestedAt: { $lte: cutoff },
      },
      {
        $set: {
          refillProcessed: true,
          refillStatus: "timed_out",
          refillTimedOut: true,
          refillTimedOutAt: new Date(),
          refillAdminNote: "Auto-paused: stuck > 48h",
        },
      }
    );

    if (timedOut.modifiedCount > 0) {
      console.log(`⏱️ Auto-timed-out ${timedOut.modifiedCount} stale refill(s)`);
    }

    /* ============================================================
       🔍 STEP 2: ACTIVE REFILLS (not processed, not timed out)
    ============================================================ */
    const orders = await Order.find({
      refillId: { $exists: true, $ne: null },
      refillProcessed: false,
      refillStatus: { $in: ["pending", "processing"] },
    });

    if (!orders.length) {
      console.log("✅ No refill jobs to sync");
      return;
    }

    console.log(`🔄 Syncing ${orders.length} refill request(s)...`);

    const grouped = {};
    for (const order of orders) {
      if (!order.providerProfileId) continue;
      const key = order.providerProfileId.toString();
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(order);
    }

    for (const providerProfileId of Object.keys(grouped)) {
      const providerOrders = grouped[providerProfileId];
      const profile = await ProviderProfile.findById(providerProfileId);

      if (!profile) {
        console.warn(`⚠️ ProviderProfile not found: ${providerProfileId}`);
        continue;
      }

      const refillIds = providerOrders.map((o) => o.refillId).filter(Boolean);
      if (!refillIds.length) continue;

      let response;
      try {
        response = await callProvider(profile, {
          action: "refill_status",
          refills: refillIds.join(","),
        });
      } catch (bulkError) {
        console.warn("⚠️ Bulk refill_status failed, falling back to single");
        for (const order of providerOrders) {
          try {
            const singleRes = await callProvider(profile, {
              action: "refill_status",
              refill: order.refillId,
            });
            await processRefillResponse(order, singleRes);
          } catch (err) {
            console.error(`❌ Single refill check failed for ${order.refillId}:`, err.message);
          }
        }
        continue;
      }

      let dataArray = [];
      if (Array.isArray(response)) {
        dataArray = response;
      } else if (typeof response === "object") {
        dataArray = Object.values(response);
      }

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

const processRefillResponse = async (order, refillData) => {
  try {
    const status = String(refillData.status || "").toLowerCase();
    if (!status) return;

    let updated = false;

    if (order.refillStatus !== status) {
      order.refillStatus = status;
      updated = true;
    }

    if (status === "completed") {
      if (!order.refillCompletedAt) { order.refillCompletedAt = new Date(); updated = true; }
      order.refillProcessed = true;
    }

    if (status === "rejected" || status === "failed") {
      if (!order.refillRejectedAt) { order.refillRejectedAt = new Date(); updated = true; }
      order.refillProcessed = true;
    }

    if (updated) {
      order.refillResponse = refillData;
      await order.save();
      console.log(`✅ Refill updated → Order ${order._id} → ${order.refillStatus}`);
    }
  } catch (err) {
    console.error("❌ Refill processing error:", err.message);
  }
};
