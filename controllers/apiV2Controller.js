
import User from "../models/User.js";
import Service from "../models/Service.js";
import Order from "../models/Order.js";
import Wallet from "../models/Wallet.js";

const calculateBalance = (transactions = []) =>
  transactions.reduce((acc, t) => acc + (t.amount || 0), 0);

export const apiV2 = async (req, res) => {
  const { key, action } = req.body;

  try {
    const user = await User.findOne({ apiKey: key });

    if (!user || !user.apiAccessEnabled) {
      return res.json({ error: "Invalid or disabled API key" });
    }

    if (user.isBlocked || user.isFrozen) {
      return res.json({ error: "Account restricted" });
    }

    switch (action) {

      /* =====================================================
         📦 SERVICES
      ===================================================== */
      case "services": {
        const services = await Service.find({ status: true });

        return res.json(
          services.map((s) => ({
            service: s.serviceId,
            name: s.name,
            type: "Default",
            category: `${s.platform} - ${s.category}`,
            rate: s.rate,
            min: s.min,
            max: s.max,
            refill: s.refillAllowed,
            cancel: s.cancelAllowed,
          }))
        );
      }

      /* =====================================================
         ➕ ADD ORDER
      ===================================================== */
      case "add": {
        const { service, link, quantity } = req.body;

        if (!service || !link || !quantity) {
          return res.json({ error: "Missing required fields" });
        }

        const selectedService = await Service.findOne({
          serviceId: service,
          status: true,
        });

        if (!selectedService) {
          return res.json({ error: "Service not found" });
        }

        const qty = Number(quantity);

        if (qty < selectedService.min || qty > selectedService.max) {
          return res.json({
            error: `Quantity must be between ${selectedService.min} and ${selectedService.max}`,
          });
        }

        const cost = Number(((qty / 1000) * selectedService.rate).toFixed(4));

        const wallet = await Wallet.findOne({ user: user._id });

        if (!wallet || wallet.balance < cost) {
          return res.json({ error: "Insufficient balance" });
        }

        // 💰 Deduct balance (consistent with sync service)
        wallet.transactions.push({
          type: "Order",
          amount: -cost,
          status: "Completed",
          note: `API Order - ${selectedService.name}`,
          createdAt: new Date(),
        });

        wallet.balance = calculateBalance(wallet.transactions);
        await wallet.save();

        // 📦 Create order
        const order = await Order.create({
          userId: user._id,
          category: selectedService.category,
          service: selectedService.name,
          serviceId: selectedService.serviceId,
          link,
          quantity: qty,
          charge: cost,
          rate: selectedService.rate,
          isCharged: true, // ✅ FIX: was missing before

          providerProfileId: selectedService.providerProfileId,
          provider: selectedService.provider,
          providerServiceId: selectedService.providerServiceId,

          cancelAllowed: selectedService.cancelAllowed,
          refillAllowed: selectedService.refillAllowed,
          refillPolicy: selectedService.refillPolicy,
          customRefillDays: selectedService.customRefillDays,
        });

        return res.json({
          order: order.customOrderId || order.orderId,
        });
      }

      /* =====================================================
         📊 ORDER STATUS (SINGLE + MULTIPLE)
      ===================================================== */
      case "status": {

        // 🔹 MULTIPLE
        if (req.body.orders) {
          const ids = req.body.orders.toString().split(",").map((id) => id.trim());

          const orders = await Order.find({
            userId: user._id,
            $or: [
              { customOrderId: { $in: ids } },
              { orderId: { $in: ids } },
            ],
          });

          const response = {};

          ids.forEach((id) => {
            const order = orders.find(
              (o) =>
                o.customOrderId?.toString() === id || o.orderId === id
            );

            if (!order) {
              response[id] = { error: "Incorrect order ID" };
            } else {
              response[id] = {
                charge: order.charge,
                start_count: 0,
                status: formatStatus(order.status),
                remains: order.quantity - order.quantityDelivered,
                currency: "USD",
              };
            }
          });

          return res.json(response);
        }

        // 🔹 SINGLE
        if (!req.body.order) {
          return res.json({ error: "Order ID required" });
        }

        const order = await Order.findOne({
          userId: user._id,
          $or: [
            { customOrderId: req.body.order },
            { orderId: req.body.order },
          ],
        });

        if (!order) {
          return res.json({ error: "Incorrect order ID" });
        }

        return res.json({
          charge: order.charge,
          start_count: 0,
          status: formatStatus(order.status),
          remains: order.quantity - order.quantityDelivered,
          currency: "USD",
        });
      }

      /* =====================================================
         🔄 REFILL (SINGLE + MULTIPLE)
      ===================================================== */
      case "refill": {

        const processRefill = async (id) => {
          const order = await Order.findOne({
            userId: user._id,
            $or: [
              { customOrderId: id },
              { orderId: id },
            ],
          });

          if (!order) return { error: "Incorrect order ID" };
          if (!order.refillAllowed) return { error: "Refill not allowed" };
          if (order.status !== "completed" && order.status !== "partial") {
            return { error: "Order not eligible for refill" };
          }
          if (order.refillRequested && !order.refillProcessed) {
            return { error: "Refill already in progress" };
          }

          order.refillRequested = true;
          order.refillRequestedAt = new Date();
          order.refillStatus = "pending";
          order.refillProcessed = false;

          await order.save();

          // Return the refillId if exists, else order internal id
          return order.refillId || order.customOrderId || order.orderId;
        };

        // 🔹 MULTIPLE
        if (req.body.orders) {
          const ids = req.body.orders.toString().split(",").map((id) => id.trim());
          const results = [];

          for (const id of ids) {
            const result = await processRefill(id);
            results.push({
              order: id,
              refill: result,
            });
          }

          return res.json(results);
        }

        // 🔹 SINGLE
        if (!req.body.order) {
          return res.json({ error: "Order ID required" });
        }

        const result = await processRefill(req.body.order.toString().trim());

        if (typeof result === "object") {
          return res.json(result);
        }

        return res.json({ refill: result });
      }

      /* =====================================================
         📋 REFILL STATUS (SINGLE + MULTIPLE) ← NEW
      ===================================================== */
      case "refill_status": {

        const getRefillStatus = async (refillId) => {
          const order = await Order.findOne({
            userId: user._id,
            $or: [
              { refillId: refillId },
              { customOrderId: refillId },
              { orderId: refillId },
            ],
          });

          if (!order || !order.refillRequested) {
            return { error: "Refill not found" };
          }

          return formatRefillStatus(order.refillStatus);
        };

        // 🔹 MULTIPLE
        if (req.body.refills) {
          const ids = req.body.refills.toString().split(",").map((id) => id.trim());
          const results = [];

          for (const id of ids) {
            const status = await getRefillStatus(id);
            results.push({
              refill: id,
              status,
            });
          }

          return res.json(results);
        }

        // 🔹 SINGLE
        if (!req.body.refill) {
          return res.json({ error: "Refill ID required" });
        }

        const status = await getRefillStatus(req.body.refill.toString().trim());

        if (typeof status === "object") {
          return res.json(status); // error object
        }

        return res.json({ status });
      }

      /* =====================================================
         ❌ CANCEL (MULTIPLE)
      ===================================================== */
      case "cancel": {
        if (!req.body.orders) {
          return res.json({ error: "Order IDs required" });
        }

        const ids = req.body.orders.toString().split(",").map((id) => id.trim());
        const results = [];

        for (const id of ids) {
          const order = await Order.findOne({
            userId: user._id,
            $or: [
              { customOrderId: id },
              { orderId: id },
            ],
          });

          if (!order) {
            results.push({ order: id, cancel: { error: "Incorrect order ID" } });
            continue;
          }

          if (!order.cancelAllowed) {
            results.push({ order: id, cancel: { error: "Cancel not allowed" } });
            continue;
          }

          if (order.status === "completed" || order.status === "cancelled") {
            results.push({ order: id, cancel: { error: "Order cannot be cancelled" } });
            continue;
          }

          order.cancelRequested = true;
          order.cancelRequestedAt = new Date();
          order.cancelStatus = "success";

          await order.save();

          results.push({ order: id, cancel: 1 });
        }

        return res.json(results);
      }

      /* =====================================================
         💰 BALANCE
      ===================================================== */
      case "balance": {
        const wallet = await Wallet.findOne({ user: user._id });

        return res.json({
          balance: wallet?.balance?.toFixed(5) || "0.00000",
          currency: "USD",
        });
      }

      default:
        return res.json({ error: "Invalid action" });
    }

  } catch (err) {
    console.error("❌ API v2 error:", err);
    return res.json({ error: "Server error" });
  }
};

/* =====================================================
   🔄 STATUS FORMATTERS
===================================================== */
const formatStatus = (status) => {
  const map = {
    pending: "Pending",
    processing: "Processing",
    completed: "Completed",
    partial: "Partial",
    cancelled: "Canceled",
    failed: "Failed",
    refunded: "Refunded",
  };
  return map[status] || "Pending";
};

const formatRefillStatus = (status) => {
  const map = {
    pending: "Pending",
    processing: "Processing",
    completed: "Completed",
    rejected: "Rejected",
    failed: "Rejected",
    none: "Pending",
  };
  return map[status] || "Pending";
};
