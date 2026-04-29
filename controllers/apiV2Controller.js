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

        // 💰 Use Wallet (NOT user.balance)
        const wallet = await Wallet.findOne({ user: user._id });

        if (!wallet || wallet.balance < cost) {
          return res.json({ error: "Insufficient balance" });
        }

        // Deduct balance
        wallet.balance -= cost;

        wallet.transactions.push({
          type: "Order",
          amount: -cost,
          status: "Completed",
          note: `API Order`,
        });

        await wallet.save();

        // Create order
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
         📊 ORDER STATUS
      ===================================================== */
      case "status": {
        const orderId = req.body.order;

        const order = await Order.findOne({
          $or: [
            { customOrderId: orderId },
            { orderId: orderId },
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
   🔄 STATUS FORMATTER (IMPORTANT)
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
