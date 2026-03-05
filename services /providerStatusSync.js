// services/providerStatusSync.js

import Order from "../models/Order.js";
import Service from "../models/Service.js";
import axios from "axios";
import { mapProviderStatus, calculateDelivered } from "../utils/providerStatusMapper.js";

// ===============================================
// 🔄 SYNC PROVIDER ORDER STATUSES
// ===============================================
export const syncProviderOrders = async (io) => {
  try {
    // 1️⃣ Get all active (not finished) orders
    const activeOrders = await Order.find({
      status: { $in: ["pending", "processing"] },
      providerOrderId: { $ne: "" },
    });

    if (!activeOrders.length) {
      console.log("✅ No active orders to check.");
      return;
    }

    console.log(`🔄 Checking ${activeOrders.length} active orders...`);

    // 2️⃣ Group orders by provider API URL + API key
    const grouped = {};

    for (const order of activeOrders) {
      const key = `${order.providerApiUrl}|${order.provider}`;

      if (!grouped[key]) grouped[key] = [];

      grouped[key].push(order);
    }

    // 3️⃣ Process each provider group
    for (const groupKey of Object.keys(grouped)) {
      const orders = grouped[groupKey];

      const [providerApiUrl] = groupKey.split("|");

      if (!providerApiUrl) continue;

      // Fetch service to get API key
      const service = await Service.findOne({
        providerApiUrl,
      });

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

        // 4️⃣ Loop each order
        for (const order of orders) {
          const providerOrder = providerData[order.providerOrderId];

          if (!providerOrder || providerOrder.error) continue;

          const mappedStatus = mapProviderStatus(providerOrder.status);

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
            order.providerResponse = providerOrder;

            await order.save();

            // 🔥 REAL-TIME EMIT
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


