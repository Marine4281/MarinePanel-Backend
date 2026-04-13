// services/providerStatusSync.js
import Order from "../models/Order.js";
import Service from "../models/Service.js";
import Wallet from "../models/Wallet.js";
import ProviderProfile from "../models/ProviderProfile.js";
import axios from "axios";
import {
  mapProviderStatus,
  calculateDelivered,
} from "../utils/providerStatusMapper.js";
import {
  creditResellerCommission,
  reverseResellerCommission,
} from "../controllers/orderController.js";

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

    // GROUP BY PROVIDER
    for (const order of activeOrders) {
      const key = order.provider?.toString();

      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(order);
    }

    for (const providerName of Object.keys(grouped)) {
      const orders = grouped[providerName];

      const profile = await ProviderProfile.findOne({ name: providerName });

      if (!profile?.apiUrl || !profile?.apiKey) {
        console.warn("⚠ Missing provider profile:", providerName);
        continue;
      }

      const orderIds = orders.map((o) => o.providerOrderId).join(",");

      try {
        const response = await axios.post(
          profile.apiUrl,
          {
            key: profile.apiKey,
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
          // NORMALIZE STATUS
          // ===============================================
          const rawStatus = providerOrder.status || "";

          const normalizedStatus = rawStatus
            .toLowerCase()
            .replace(/\s+/g, "")
            .trim();

          let mappedStatus = mapProviderStatus(normalizedStatus);

          // AUTO COMPLETE FIX
          if (
            providerOrder.remains == 0 &&
            mappedStatus === "processing"
          ) {
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

          if (!updated) continue;

          // =====================================================
          // PROVIDER STATUS SAVE
          // =====================================================
          order.providerStatus = String(
            providerOrder.status || ""
          ).toLowerCase();

          // =====================================================
          // 🧠 CANCEL HANDLING (STRICT & SAFE)
          // =====================================================
          if (order.cancelRequested && !order.cancelProcessed) {
            const providerStatus = String(
              providerOrder.status || ""
            ).toLowerCase();

            const isCancelled =
              providerStatus.includes("cancel") ||
              mappedStatus === "cancelled";

            if (isCancelled) {
              order.status = "cancelled";
              order.cancelStatus = "success";
              order.cancelProcessed = true;

              if (!order.isFreeOrder && !order.refundProcessed) {
                let wallet = await Wallet.findOne({
                  user: order.userId,
                });

                if (!wallet) {
                  wallet = await Wallet.create({
                    user: order.userId,
                    balance: 0,
                    transactions: [],
                  });
                }

                wallet.balance += order.charge;

                wallet.transactions.push({
                  type: "Refund",
                  amount: order.charge,
                  status: "Completed",
                  note: `Refund for cancelled order ${order.orderId}`,
                });

                order.refundProcessed = true;

                await wallet.save();
                await reverseResellerCommission(order);
              }
            } else {
              order.cancelStatus = "processing";
            }
          }

          // =====================================================
          // 🔁 REFILL HANDLING (NEW SAFE LOGIC)
          // =====================================================
          if (order.refillRequested && !order.refillProcessed) {
            const refillStatus =
              String(providerOrder.refill || "").toLowerCase();

            order.refillStatus = refillStatus || "pending";

            if (
              refillStatus.includes("completed") ||
              refillStatus.includes("success")
            ) {
              order.refillProcessed = true;
              order.refillStatus = "completed";
            }

            if (
              refillStatus.includes("rejected") ||
              refillStatus.includes("failed")
            ) {
              order.refillProcessed = true;
              order.refillStatus = "failed";
            }
          }

          // =====================================================
          // 💰 REFUND LOGIC (FAILED / PARTIAL ONLY)
          // =====================================================
          if (
            !order.isFreeOrder &&
            !order.refundProcessed &&
            !order.cancelProcessed
          ) {
            let wallet = await Wallet.findOne({
              user: order.userId,
            });

            if (!wallet) {
              wallet = await Wallet.create({
                user: order.userId,
                balance: 0,
                transactions: [],
              });
            }

            // ================= FAILED =================
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

            // ================= PARTIAL =================
            if (mappedStatus === "partial") {
              const remaining =
                Number(providerOrder.remains) || 0;

              if (remaining > 0) {
                let refundAmount =
                  (remaining / order.quantity) *
                  order.charge;

                refundAmount = Number(
                  refundAmount.toFixed(4)
                );

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

          // =====================================================
          // 💰 CREDIT RESELLER
          // =====================================================
          if (order.status === "completed") {
            await creditResellerCommission(order);
          }

          // =====================================================
          // 🔥 REAL-TIME UPDATE
          // =====================================================
          if (io) {
            io.to(order.userId.toString()).emit(
              "orderUpdated",
              {
                orderId: order._id,
                status: order.status,
                delivered: order.quantityDelivered,
                total: order.quantity,
                refillStatus: order.refillStatus || null,
                cancelStatus: order.cancelStatus || null,
              }
            );
          }
        }
      } catch (err) {
        console.error(
          "❌ Provider status fetch error:",
          err.response?.data || err.message
        );
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
