import User from "../models/User.js";
import Service from "../models/Service.js";
import Order from "../models/Order.js";
import Wallet from "../models/Wallet.js";

export const apiV2 = async (req, res) => {
  const { key, action } = req.body;

  try {
    // 🔐 Validate API Key
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

        const selectedService = await Service.findOne({
          serviceId: service,
          status: true,
        });

        if (!selectedService) {
          return res.json({ error: "Service not found" });
        }

        if (quantity < selectedService.min || quantity > selectedService.max) {
          return res.json({ error: "Invalid quantity" });
        }

        const cost = (quantity / 1000) * selectedService.rate;

        const wallet = await Wallet.findOne({ user: user._id });

        if (!wallet || wallet.balance < cost) {
          return res.json({ error: "Insufficient balance" });
        }

        // 💰 Deduct balance
        wallet.balance -= cost;

        wallet.transactions.push({
          type: "Order",
          amount: -cost,
          status: "Completed",
          note: "API Order",
        });

        await wallet.save();

        // 📦 Create order
        const order = await Order.create({
          userId: user._id,
          category: selectedService.category,
          service: selectedService.name,
          serviceId: selectedService.serviceId,
          link,
          quantity,
          charge: cost,
          rate: selectedService.rate,

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

        // 🔹 MULTIPLE STATUS
        if (req.body.orders) {
          const ids = req.body.orders.toString().split(",");

          const orders = await Order.find({
            $or: [
              { customOrderId: { $in: ids } },
              { orderId: { $in: ids } },
            ],
          });

          const response = {};

          ids.forEach((id) => {
            const order = orders.find(
              (o) =>
                o.customOrderId?.toString() === id ||
                o.orderId === id
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

        // 🔹 SINGLE STATUS
        const order = await Order.findOne({
          $or: [
            { customOrderId: req.body.order },
            { orderId: req.body.order },
          ],
        });

        if (!order) {
          return res.json({ error: "Order not found" });
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
            $or: [
              { customOrderId: id },
              { orderId: id },
            ],
          });

          if (!order) return { error: "Incorrect order ID" };

          if (!order.refillAllowed) {
            return { error: "Refill not allowed" };
          }

          order.refillRequested = true;
          order.refillRequestedAt = new Date();
          order.refillStatus = "pending";

          await order.save();

          return 1;
        };

        // 🔹 MULTIPLE
        if (req.body.orders) {
          const ids = req.body.orders.toString().split(",");
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
        const result = await processRefill(req.body.order);

        if (typeof result === "object") {
          return res.json(result);
        }

        return res.json({ refill: result });
      }

      /* =====================================================
         ❌ CANCEL (MULTIPLE)
      ===================================================== */
      case "cancel": {
        const ids = req.body.orders?.toString().split(",") || [];

        const results = [];

        for (const id of ids) {
          const order = await Order.findOne({
            $or: [
              { customOrderId: id },
              { orderId: id },
            ],
          });

          if (!order) {
            results.push({
              order: id,
              cancel: { error: "Incorrect order ID" },
            });
            continue;
          }

          if (!order.cancelAllowed) {
            results.push({
              order: id,
              cancel: { error: "Cancel not allowed" },
            });
            continue;
          }

          order.cancelRequested = true;
          order.cancelRequestedAt = new Date();
          order.cancelStatus = "success";

          await order.save();

          results.push({
            order: id,
            cancel: 1,
          });
        }

        return res.json(results);
      }

      /* =====================================================
         💰 BALANCE
      ===================================================== */
      case "balance": {
        const wallet = await Wallet.findOne({ user: user._id });

        return res.json({
          balance: wallet?.balance || 0,
          currency: "USD",
        });
      }

      default:
        return res.json({ error: "Invalid action" });
    }

  } catch (err) {
    console.error(err);
    return res.json({ error: "Server error" });
  }
};

/* =====================================================
   🔄 STATUS FORMATTER
===================================================== */
const formatStatus = (status) => {
  switch (status) {
    case "pending":
      return "Pending";
    case "processing":
      return "Processing";
    case "completed":
      return "Completed";
    case "partial":
      return "Partial";
    case "cancelled":
      return "Canceled";
    case "failed":
      return "Failed";
    default:
      return "Pending";
  }
};
