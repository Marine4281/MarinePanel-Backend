// services/providerStatusSync.js

import Order from "../models/Order.js";
import Service from "../models/Service.js";
import Wallet from "../models/Wallet.js";
import axios from "axios";
import { mapProviderStatus, calculateDelivered } from "../utils/providerStatusMapper.js";

// ===============================================
// 🔄 SYNC PROVIDER ORDER STATUSES
// ===============================================
export const syncProviderOrders = async (io) => {
  try {
    const activeOrders = await Order.find({
      status: { $in: ["pending", "processing"] },
      providerOrderId: { $ne: "" },
    });

    if (!activeOrders.length) {
      console.log("✅ No active orders to check.");
      return;
    }

    console.log(`🔄 Checking ${activeOrders.length} active orders...`);

    const grouped = {};

    for (const order of activeOrders) {
      const key = `${order.providerApiUrl}|${order.provider}`;

      if (!grouped[key]) grouped[key] = [];

      grouped[key].push(order);
    }

    for (const groupKey of Object.keys(grouped)) {
      const orders = grouped[groupKey];

      const [providerApiUrl] = groupKey.split("|");

      if (!providerApiUrl) continue;

      const service = await Service.findOne({ providerApiUrl });

      if (!service?.providerApiKey) continue;

      const orderIds = orders.map((o) => o.providerOrderId).join(",");

      try {
        const response = await axios.post(
          providerApiUrl,
          {
            key: service.providerApiKey,
            action: "status",
            orders: orderIds,
          },
          { timeout: 15000 }
        );

        const providerData = response.data;

        for (const order of orders) {
          const providerOrder = providerData[order.providerOrderId];

          if (!providerOrder || providerOrder.error) continue;

          // ===============================================
          // NORMALIZE PROVIDER STATUS
          // ===============================================
          const rawStatus = providerOrder.status || "";

          const normalizedStatus = rawStatus
            .toLowerCase()
            .replace(/\s+/g, "")
            .trim();

          // Map to system status
          let mappedStatus = mapProviderStatus(normalizedStatus);

          // ===============================================
          // AUTO COMPLETE CHECK
          // Some providers keep "processing" but remains = 0
          // ===============================================
          if (providerOrder.remains == 0 && mappedStatus === "processing") {
            mappedStatus = "completed";
          }

          const delivered = calculateDelivered(
            order.quantity,
            providerOrder.remains
          );

          let updated = false;

          if (order.status !== mappedStatus) {
            order.status = mappedStatus;
            updated = true;
          }

          if (order.quantityDelivered !== delivered) {
            order.quantityDelivered = delivered;
            updated = true;
          }

          if (updated) {

            order.providerStatus = providerOrder.status;
            String(providerOrder.status).toLowerCase();

            // ===============================================
            // ===============================================
// 💰 REFUND LOGIC
// ===============================================

if (!order.isFreeOrder && !order.refundProcessed) {

  const wallet = await Wallet.findOne({ userId: order.userId });

  if (wallet) {

    // ==============================
    // FULL REFUND (FAILED)
    // ==============================
    if (mappedStatus === "failed") {

      wallet.balance += order.charge;

      wallet.transactions.push({
        type: "refund",
        amount: order.charge,
        description: `Refund for failed order ${order.orderId}`,
        createdAt: new Date(),
      });

      order.refundProcessed = true;

      await wallet.save();
    }

    // ==============================
    // PARTIAL REFUND
    // ==============================
    if (mappedStatus === "partial") {

      const remaining = Number(providerOrder.remains) || 0;

      if (remaining > 0) {

        let refundAmount =
          (remaining / order.quantity) * order.charge;

        refundAmount = Number(refundAmount.toFixed(4));

        wallet.balance += refundAmount;

        wallet.transactions.push({
          type: "refund",
          amount: refundAmount,
          description: `Partial refund for order ${order.orderId}`,
          createdAt: new Date(),
        });

        order.refundProcessed = true;

        await wallet.save();
      }
    }
  }
}
            await order.save();


            // 🔥 Real-time update
            if (io) {
              io.to(order.userId.toString()).emit("orderUpdated", {
                orderId: order._id,
                status: order.status,
                delivered: order.quantityDelivered,
                total: order.quantity,
              });
            }
          }
        }
      } catch (err) {
        console.error("❌ Provider status fetch error:", err.message);
      }
    }
  } catch (error) {
    console.error("❌ Order sync error:", error);
  }
};


// ===============================================
// 🚀 START AUTO SYNC LOOP
// ===============================================
export const startProviderStatusSync = (io) => {
  console.log("🚀 Provider order sync started");

  const runSync = async () => {
    await syncProviderOrders(io);
  };

  // run immediately
  runSync();

  // run every 60 seconds
  setInterval(runSync, 60000);
};


