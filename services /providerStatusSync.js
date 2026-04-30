// services/providerStatusSync.js
import Order from "../models/Order.js";
import ProviderProfile from "../models/ProviderProfile.js";
import Wallet from "../models/Wallet.js";
import User from "../models/User.js";
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

          const rawStatus = providerOrder.status || "";

          let mappedStatus = mapProviderStatus(
            rawStatus.toLowerCase().replace(/\s+/g, "").trim()
          );

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

            // ✅ FIX: guard refund block instead of continue
            // so commission + socket emit still run below
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

                // 🔥 SYNC USER BALANCE
                await User.findByIdAndUpdate(order.userId, {
                  balance: wallet.balance,
                });

                // 📡 EMIT WALLET UPDATE
                if (io) {
                  io.emit("wallet:update", {
                    userId: order.userId.toString(),
                    balance: wallet.balance,
                  });
                }
              }

              // ================= PARTIAL =================
              if (mappedStatus === "partial") {
                const remaining = Number(providerOrder.remains) || 0;

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
                  await reverseResellerCommission(order); // ✅ FIX: was missing
                  await order.save();

                  // 🔥 SYNC USER BALANCE
                  await User.findByIdAndUpdate(order.userId, {
                    balance: wallet.balance,
                  });

                  // 📡 EMIT WALLET UPDATE
                  if (io) {
                    io.emit("wallet:update", {
                      userId: order.userId.toString(),
                      balance: wallet.balance,
                    });
                  }
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
