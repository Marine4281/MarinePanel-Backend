import User from "../models/User.js";
import Service from "../models/Service.js";
import Order from "../models/Order.js";
import Wallet from "../models/Wallet.js";
import Settings from "../models/Settings.js";

const calculateBalance = (transactions = []) =>
  transactions.reduce((acc, t) => acc + (t.amount || 0), 0);

// ✅ Safe query builder for customOrderId (Number) + orderId (String).
const buildOrderQuery = (userId, rawId) => {
  const str = rawId?.toString().trim();
  const num = !isNaN(str) && str !== "" ? Number(str) : null;

  return {
    userId,
    $or: [
      ...(num !== null ? [{ customOrderId: num }] : []),
      { orderId: str },
    ],
  };
};

// Same as above but for arrays
const buildMultiOrderQuery = (userId, rawIds) => {
  const numericIds = rawIds.filter((id) => !isNaN(id) && id !== "").map(Number);
  const stringIds = rawIds;

  return {
    userId,
    $or: [
      ...(numericIds.length ? [{ customOrderId: { $in: numericIds } }] : []),
      { orderId: { $in: stringIds } },
    ],
  };
};

/* =====================================================
   💰 RATE RESOLVER
   Mirrors the exact same logic as orderController.js
   so API orders are charged identically to web orders.
   Returns finalRate, finalCharge, resellerCommission,
   childPanelOwner, childPanelCommission.
===================================================== */
const resolveRateAndOwnership = async (user, selectedService, qty) => {
  const providerRate = Number(selectedService.rate || 0);
  const settings = await Settings.findOne().lean();
  const adminRate = Number(settings?.commission || 0);

  // Admin commission baked in — same as web flow
  const systemRate = providerRate + (providerRate * adminRate) / 100;

  let finalRate = systemRate;
  let resellerCommission = 0;
  let resellerOwnerId = null;

  // If the API key owner is a user who belongs to a reseller
  if (user.resellerOwner) {
    const reseller = await User.findById(user.resellerOwner);
    const resellerRate = Number(reseller?.resellerCommissionRate || 0);

    if (resellerRate > 0) {
      finalRate = systemRate + (systemRate * resellerRate) / 100;
      resellerCommission = ((qty / 1000) * systemRate * resellerRate) / 100;
    }

    resellerOwnerId = user.resellerOwner;
  }

  const finalCharge = Number(((qty / 1000) * finalRate).toFixed(4));

  // Child panel ownership
  let childPanelOwnerId = null;
  let childPanelCommission = 0;
  let childPanelPerOrderFee = 0;

  if (user.childPanelOwner) {
    const cpOwner = await User.findById(user.childPanelOwner);
    if (cpOwner && cpOwner.isChildPanel && cpOwner.childPanelIsActive) {
      childPanelOwnerId = cpOwner._id;
      childPanelPerOrderFee = Number(cpOwner.childPanelPerOrderFee || 0);
      const cpCommissionRate = Number(cpOwner.childPanelCommissionRate || 0);
      if (cpCommissionRate > 0) {
        childPanelCommission = (finalCharge * cpCommissionRate) / 100;
      }
    }
  }

  return {
    providerRate,
    systemRate,
    finalRate,
    finalCharge,
    resellerOwnerId,
    resellerCommission,
    childPanelOwnerId,
    childPanelCommission,
    childPanelPerOrderFee,
  };
};

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
         ✅ FIX: Rate returned is now the correct final rate
         for this user (admin commission + reseller markup),
         not the raw provider rate.
      ===================================================== */
      case "services": {
        const services = await Service.find({ status: true });

        const settings = await Settings.findOne().lean();
        const adminRate = Number(settings?.commission || 0);

        let resellerRate = 0;
        if (user.resellerOwner) {
          const reseller = await User.findById(user.resellerOwner);
          resellerRate = Number(reseller?.resellerCommissionRate || 0);
        }

        return res.json(
          services.map((s) => {
            const providerRate = Number(s.rate || 0);
            const systemRate = providerRate + (providerRate * adminRate) / 100;
            const finalRate =
              resellerRate > 0
                ? systemRate + (systemRate * resellerRate) / 100
                : systemRate;

            return {
              service: s.serviceId,
              name: s.name,
              type: "Default",
              category: `${s.platform} - ${s.category}`,
              rate: Number(finalRate.toFixed(4)),
              min: s.min,
              max: s.max,
              refill: s.refillAllowed,
              cancel: s.cancelAllowed,
              description: s.description || "",
            };
          })
        );
      }

      /* =====================================================
         ➕ ADD ORDER
         ✅ FIX: Applies admin commission + reseller markup,
         stamps resellerOwner + childPanelOwner on the order,
         identical to the web order flow.
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

        // ✅ FIX: Resolve correct charge with full commission chain
        const {
          finalCharge,
          resellerOwnerId,
          resellerCommission,
          childPanelOwnerId,
          childPanelCommission,
          childPanelPerOrderFee,
        } = await resolveRateAndOwnership(user, selectedService, qty);

        const wallet = await Wallet.findOne({ user: user._id });

        if (!wallet || wallet.balance < finalCharge) {
          return res.json({ error: "Insufficient balance" });
        }

        // Deduct balance
        wallet.transactions.push({
          type: "Order",
          amount: -finalCharge,
          status: "Completed",
          note: `API Order - ${selectedService.name}`,
          createdAt: new Date(),
        });

        wallet.balance = calculateBalance(wallet.transactions);
        await wallet.save();

        // ✅ FIX: Stamp resellerOwner + childPanelOwner so commission
        // tracking, dashboards, and billing all work correctly
        const order = await Order.create({
          userId: user._id,
          category: selectedService.category,
          service: selectedService.name,
          serviceId: selectedService.serviceId,
          link,
          quantity: qty,
          charge: finalCharge,
          rate: Number(selectedService.rate || 0),
          isCharged: true,

          // Reseller
          resellerOwner: resellerOwnerId,
          resellerCommission,
          earningsCredited: false,

          // Child panel
          childPanelOwner: childPanelOwnerId,
          childPanelCommission,
          childPanelEarningsCredited: false,
          childPanelPerOrderFee,

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

          const orders = await Order.find(buildMultiOrderQuery(user._id, ids));

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
                remains: order.quantity - (order.quantityDelivered || 0),
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

        const order = await Order.findOne(
          buildOrderQuery(user._id, req.body.order)
        );

        if (!order) {
          return res.json({ error: "Incorrect order ID" });
        }

        return res.json({
          charge: order.charge,
          start_count: 0,
          status: formatStatus(order.status),
          remains: order.quantity - (order.quantityDelivered || 0),
          currency: "USD",
        });
      }

      /* =====================================================
         🔄 REFILL (SINGLE + MULTIPLE)
      ===================================================== */
      case "refill": {

        const processRefill = async (id) => {
          const order = await Order.findOne(buildOrderQuery(user._id, id));

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

          return order.refillId || order.customOrderId || order.orderId;
        };

        // 🔹 MULTIPLE
        if (req.body.orders) {
          const ids = req.body.orders.toString().split(",").map((id) => id.trim());
          const results = [];

          for (const id of ids) {
            const result = await processRefill(id);
            results.push({ order: id, refill: result });
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
         📋 REFILL STATUS (SINGLE + MULTIPLE)
      ===================================================== */
      case "refill_status": {

        const getRefillStatus = async (refillId) => {
          const str = refillId?.toString().trim();
          const num = !isNaN(str) && str !== "" ? Number(str) : null;

          const order = await Order.findOne({
            userId: user._id,
            $or: [
              { refillId: str },
              ...(num !== null ? [{ customOrderId: num }] : []),
              { orderId: str },
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
            results.push({ refill: id, status });
          }

          return res.json(results);
        }

        // 🔹 SINGLE
        if (!req.body.refill) {
          return res.json({ error: "Refill ID required" });
        }

        const status = await getRefillStatus(req.body.refill.toString().trim());

        if (typeof status === "object") {
          return res.json(status);
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
          const order = await Order.findOne(buildOrderQuery(user._id, id));

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
