//services/providerStatusSync.js
import Order from "../models/Order.js";
import Service from "../models/Service.js";
import Wallet from "../models/Wallet.js";
import axios from "axios";
import { mapProviderStatus, calculateDelivered } from "../utils/providerStatusMapper.js";
import { creditResellerCommission, reverseResellerCommission } from "../controllers/orderController.js";

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

      // ✅ KEEPING YOUR ORIGINAL LOGIC (non-breaking)
      const service = await Service.findOne({ providerApiUrl });

      const apiKey = service?.providerApiKey;
      if (!apiKey) {
        console.log("⚠️ Missing API key for:", providerApiUrl);
        continue;
      }

      const orderIds = orders.map((o) => o.providerOrderId).join(",");

      try {
        // ✅ FIXED REQUEST FORMAT (IMPORTANT)
        const params = new URLSearchParams();
        params.append("key", apiKey);
        params.append("action", "status");
        params.append("orders", orderIds);

        const response = await axios.post(providerApiUrl, params, {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          timeout: 15000,
        });

        const providerData = response.data;

        for (const order of orders) {
          // ✅ HANDLE BOTH RESPONSE TYPES
          let providerOrder;

          if (Array.isArray(providerData)) {
            providerOrder = providerData.find(
              (p) => String(p.order) === String(order.providerOrderId)
            );
          } else {
            providerOrder = providerData?.[order.providerOrderId];
          }

          if (!providerOrder) {
            console.log("⚠️ Missing provider order:", order.providerOrderId);
            continue;
          }

          if (providerOrder.error) {
            console.log("❌ Provider error:", providerOrder.error);
            continue;
          }

          // ===============================================
          // NORMALIZE PROVIDER STATUS
          // ===============================================
          const rawStatus = providerOrder.status || "";

          // ✅ SAFER NORMALIZATION (non-breaking)
          const normalizedStatus = rawStatus.toLowerCase().trim();

          let mappedStatus = mapProviderStatus(normalizedStatus);

          // ===============================================
          // AUTO COMPLETE CHECK
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
            order.providerStatus = rawStatus;

            // ===============================================
            // 💰 REFUND LOGIC (SAFE VERSION)
            // ===============================================
            if (!order.isFreeOrder && !order.refundProcessed) {

              let wallet = await Wallet.findOne({ user: order.userId });

              if (!wallet) {
                wallet = await Wallet.create({
                  user: order.userId,
                  balance: 0,
                  transactions: [],
                });
              }

              // ==============================
              // FULL REFUND (FAILED)
              // ==============================
              if (mappedStatus === "failed") {

                wallet.balance += order.charge;

                wallet.transactions.push({
                  type: "Refund",
                  amount: order.charge,
                  status: "Completed",
                  note: `Refund for failed order ${order.orderId}`,
                });

                order.refundProcessed = true;

                await wallet.save();
                await reverseResellerCommission(order);
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
                    type: "Refund",
                    amount: refundAmount,
                    status: "Completed",
                    note: `Partial refund for order ${order.orderId} (${remaining} undelivered)`,
                  });

                  order.refundProcessed = true;

                  await wallet.save();
                }
              }
            }

            await order.save();

            // ===============================================
            // 💰 CREDIT RESELLER
            // ===============================================
            if (order.status === "completed") {
              await creditResellerCommission(order);
            }

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

  runSync();

  setInterval(runSync, 45000);
};
