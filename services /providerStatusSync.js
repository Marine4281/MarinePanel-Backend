// services/providerStatusSync.js
import Order from "../models/Order.js";
import ProviderProfile from "../models/ProviderProfile.js";
import Wallet from "../models/Wallet.js";
import axios from "axios";
import {
  mapProviderStatus,
  calculateDelivered,
} from "../utils/providerStatusMapper.js";
import {
  creditResellerCommission,
  reverseResellerCommission,
} from "../controllers/orderController.js";

// 🔥 SAME helper used everywhere
const calculateBalance = (transactions = []) =>
  transactions.reduce((acc, t) => acc + (t.amount || 0), 0);

// ===============================================
// 🔄 SYNC PROVIDER ORDER STATUSES (PRODUCTION SAFE)
// ===============================================
export const syncProviderOrders = async (io) => {
  try {
    // ✅ FIX: Also pick up partial/failed orders that were never refunded.
    // Previously only "pending" and "processing" were queried, so once an
    // order transitioned to partial/failed it was permanently excluded from
    // the sync and the refund block never ran again.
    const activeOrders = await Order.find({
      $or: [
        // Normal in-flight orders
        {
          status: { $in: ["pending", "processing"] },
          providerOrderId: { $ne: "" },
        },
        // Charged orders that ended partial/failed but were never refunded
        {
          status: { $in: ["partial", "failed"] },
          isCharged: true,
          refundProcessed: false,
          isFreeOrder: { $ne: true },
        },
      ],
    });

    if (!activeOrders.length) {
      console.log("✅ No active orders to check.");
      return;
    }

    console.log(`🔄 Checking ${activeOrders.length} active orders...`);

    const grouped = {};

    for (const order of activeOrders) {
      const key = order.provider;
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

      const orderIds = orders
        .map((o) => o.providerOrderId)
        .filter(Boolean)
        .join(",");

      let providerData = {};

      if (orderIds) {
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
          providerData = response.data;
        } catch (err) {
          console.error(
            "❌ Provider status fetch error:",
            err.response?.data || err.message
          );
          continue;
        }
      }

      for (const order of orders) {
        const providerOrder = providerData[order.providerOrderId];

        // ✅ FIX: For partial/failed orders re-queued only for refund,
        // there may be no fresh provider data — that is fine. We still
        // fall through to the refund block using the status already on the order.
        const isRefundRetry =
          ["partial", "failed"].includes(order.status) &&
          order.isCharged &&
          !order.refundProcessed;

        if (!isRefundRetry) {
          if (!providerOrder || providerOrder.error) continue;
        }

        // -----------------------------------------------
        // STATUS + QUANTITY UPDATE
        // (only when provider returned fresh data)
        // -----------------------------------------------
        let mappedStatus = order.status; // default to stored status

        if (providerOrder && !providerOrder.error) {
          const rawStatus = providerOrder.status || "";

          mappedStatus = mapProviderStatus(
            rawStatus.toLowerCase().replace(/\s+/g, "").trim()
          );

          if (providerOrder.remains == 0 && mappedStatus === "processing") {
            mappedStatus = "completed";
          }

          const delivered = calculateDelivered(
            order.quantity,
            providerOrder.remains
          );

          let statusChanged = false;

          if (order.status !== mappedStatus) {
            order.status = mappedStatus;
            statusChanged = true;
          }

          if (order.quantityDelivered !== delivered) {
            order.quantityDelivered = delivered;
            statusChanged = true;
          }

          order.providerStatus = String(providerOrder.status || "").toLowerCase();

          if (statusChanged) {
            await order.save();
          }
        }

        // ===============================================
        // 💰 REFUND LOGIC (FIXED & SAFE)
        // ===============================================
        if (
          !order.isFreeOrder &&
          order.isCharged &&
          !order.refundProcessed &&
          !order.cancelProcessed
        ) {
          let wallet = await Wallet.findOne({ user: order.userId });

          if (!wallet) {
            wallet = await Wallet.create({
              user: order.userId,
              balance: 0,
              transactions: [],
            });
          }

          // 🔍 prevent duplicate refunds
          const alreadyRefunded = wallet.transactions.some(
            (t) =>
              t.type === "Refund" &&
              t.reference?.toString() === order._id.toString()
          );

          if (!alreadyRefunded) {

            // ================= FAILED =================
            if (mappedStatus === "failed") {
              wallet.transactions.push({
                type: "Refund",
                amount: order.charge,
                status: "Completed",
                note: `Refund for failed order ${order.orderId}`,
                reference: order._id,
                createdAt: new Date(),
              });

              wallet.balance = calculateBalance(wallet.transactions);
              order.refundProcessed = true;

              await wallet.save();
              await reverseResellerCommission(order);
              await order.save();
            }

            // ================= PARTIAL =================
            if (mappedStatus === "partial") {
              // ✅ FIX: Fall back to stored quantityDelivered when provider
              // returns remains=0 on a partial, or when this is a refund retry
              // with no fresh provider data, so the refund is never skipped.
              const remaining =
                providerOrder && !providerOrder.error
                  ? Number(providerOrder.remains) || 0
                  : order.quantity - (order.quantityDelivered || 0);

              if (remaining > 0) {
                let refundAmount =
                  (remaining / order.quantity) * order.charge;

                refundAmount = Number(refundAmount.toFixed(4));

                wallet.transactions.push({
                  type: "Refund",
                  amount: refundAmount,
                  status: "Completed",
                  note: `Partial refund for order ${order.orderId} (${remaining} undelivered)`,
                  reference: order._id,
                  createdAt: new Date(),
                });

                wallet.balance = calculateBalance(wallet.transactions);
                order.refundProcessed = true;

                await wallet.save();
                await reverseResellerCommission(order);
                await order.save();
              } else {
                // Provider marked partial but claims 0 remaining —
                // nothing to refund. Mark processed so we stop retrying.
                order.refundProcessed = true;
                await order.save();
              }
            }
          }
        }

        // ===============================================
        // 💰 RESELLER COMMISSION
        // ===============================================
        if (order.status === "completed") {
          await creditResellerCommission(order);
        }

        // ===============================================
        // 🔥 REAL-TIME UPDATE
        // ===============================================
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
  } catch (error) {
    console.error("❌ Order sync error:", error);
  }
};
