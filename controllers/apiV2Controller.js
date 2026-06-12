import User from "../models/User.js";
import Service from "../models/Service.js";
import Order from "../models/Order.js";
import Wallet from "../models/Wallet.js";
import Settings from "../models/Settings.js";
import ProviderProfile from "../models/ProviderProfile.js";
import axios from "axios";
import { getNextOrderId } from "../utils/orderId.js";
import { formatProviderStatusDisplay } from "../utils/providerStatusMapper.js";

const calculateBalance = (transactions = []) =>
  transactions.reduce((acc, t) => acc + (t.amount || 0), 0);

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

const resolveRateAndOwnership = async (user, selectedService, qty) => {
  const providerRate = Number(selectedService.rate || 0);
  const settings = await Settings.findOne().lean();
  const adminRate = Number(settings?.commission || 0);

  const systemRate = providerRate + (providerRate * adminRate) / 100;

  let finalRate = systemRate;
  let resellerCommission = 0;
  let resellerOwnerId = null;

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

      case "services": {
  let serviceQuery = { status: true, cpOwner: null };
  if (user.childPanelOwner) {
    serviceQuery = {
      status: true,
      $or: [
        { cpOwner: user.childPanelOwner },
        { cpOwner: null, availableToChildPanels: true },
      ],
    };
  }
  const services = await Service.find(serviceQuery);
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

      case "add": {
        const { service, link, quantity } = req.body;

        if (!service || !link || !quantity) {
          return res.json({ error: "Missing required fields" });
        }

        let selectedService;
if (user.childPanelOwner) {
  selectedService = await Service.findOne({
    serviceId: service,
    status: true,
    cpOwner: user.childPanelOwner,
  });
  if (!selectedService) {
    selectedService = await Service.findOne({
      serviceId: service,
      status: true,
      cpOwner: null,
      availableToChildPanels: true,
    });
  }
} else {
  selectedService = await Service.findOne({
    serviceId: service,
    status: true,
    cpOwner: null,
  });
}

if (!selectedService) {
  return res.json({ error: "Service not found" });
}

        const qty = Number(quantity);

        if (qty < selectedService.min || qty > selectedService.max) {
          return res.json({
            error: `Quantity must be between ${selectedService.min} and ${selectedService.max}`,
          });
        }

        const {
          providerRate,
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

        const customOrderId = await getNextOrderId();

        // ─── DEDUCT END-USER WALLET ───────────────────────────────────────
        wallet.transactions.push({
          type: "Order",
          amount: -finalCharge,
          status: "Completed",
          note: `API Order - #${customOrderId}`,
          createdAt: new Date(),
        });

        wallet.balance = calculateBalance(wallet.transactions);
        await wallet.save();

        // ─── DEDUCT BASE COST FROM CP OWNER ──────────────────────────────
        // If CP owner can't cover cost: skip provider call, leave order pending.
        // End-user is already charged — their order just waits. No error returned.
        const baseCharge = Number(((qty / 1000) * providerRate).toFixed(4));
        let cpOwnerInsufficientFunds = false;

        if (childPanelOwnerId && baseCharge > 0) {
          const cpOwnerWallet = await Wallet.findOne({ user: childPanelOwnerId });

          if (cpOwnerWallet) {
            const cpOwnerBalance = calculateBalance(cpOwnerWallet.transactions);

            if (cpOwnerBalance < baseCharge) {
              cpOwnerInsufficientFunds = true;
            } else {
              cpOwnerWallet.transactions.push({
                type: "Order",
                amount: -baseCharge,
                status: "Completed",
                note: `CP end-user API order cost #${customOrderId}`,
                createdAt: new Date(),
              });
              cpOwnerWallet.balance = calculateBalance(cpOwnerWallet.transactions);
              await cpOwnerWallet.save();

              await User.findByIdAndUpdate(childPanelOwnerId, {
                balance: cpOwnerWallet.balance,
              });
            }
          }
        }

        // ─── FETCH PROVIDER PROFILE ───────────────────────────────────────
        const providerProfile = await ProviderProfile.findById(
          selectedService.providerProfileId
        );

        // ─── CREATE ORDER ─────────────────────────────────────────────────
        const order = await Order.create({
          userId: user._id,
          customOrderId,
          category: selectedService.category,
          service: selectedService.name,
          serviceId: selectedService.serviceId,
          link,
          quantity: qty,
          charge: finalCharge,
          rate: Number(selectedService.rate || 0),
          isCharged: true,

          resellerOwner: resellerOwnerId,
          resellerCommission,
          earningsCredited: false,

          childPanelOwner: childPanelOwnerId,
          childPanelCommission,
          childPanelEarningsCredited: false,
          childPanelPerOrderFee,

          providerProfileId: selectedService.providerProfileId,
          provider: selectedService.provider,
          providerServiceId: selectedService.providerServiceId,
          providerApiUrl: providerProfile?.apiUrl || "",

          cancelAllowed: selectedService.cancelAllowed,
          refillAllowed: selectedService.refillAllowed,
          refillPolicy: selectedService.refillPolicy,
          customRefillDays: selectedService.customRefillDays,
        });

        // ─── PROVIDER CALL ────────────────────────────────────────────────
        // Skip entirely if CP owner has insufficient funds.
        // Order stays "pending" — no error shown to the API caller.
        if (cpOwnerInsufficientFunds) {
          order.status = "pending";
          order.providerStatus = "pending";
          order.errorMessage = "CP owner insufficient funds — provider call skipped";
          await order.save();
        } else if (providerProfile?.apiUrl && providerProfile?.apiKey) {
          try {
            const payload = {
              key: providerProfile.apiKey,
              action: "add",
              service: selectedService.providerServiceId,
              link,
              quantity: qty,
            };

            const providerRes = await axios.post(providerProfile.apiUrl, payload, {
              timeout: 15000,
            });

            if (providerRes?.data?.order) {
              order.providerOrderId = providerRes.data.order;
              order.providerStatus = "processing";
              order.status = "processing";
            } else {
              order.providerStatus = "processing";
              order.status = "processing";
            }

            order.providerResponse = providerRes.data;
            await order.save();

          } catch (providerErr) {
            // Refund end-user on provider failure
            wallet.transactions.push({
              type: "Refund",
              amount: finalCharge,
              status: "Completed",
              note: `Refund - Provider failed #${customOrderId}`,
              reference: order._id,
              createdAt: new Date(),
            });
            wallet.balance = calculateBalance(wallet.transactions);
            await wallet.save();

            order.status = "failed";
            order.providerStatus = "failed";
            order.refundProcessed = true;
            await order.save();

            return res.json({ error: "Provider failed. Your balance has been refunded." });
          }
        }

        return res.json({ order: order.customOrderId });
      }

      case "status": {

        if (req.body.orders) {
          const ids = req.body.orders.toString().split(",").map((id) => id.trim());
          const orders = await Order.find(buildMultiOrderQuery(user._id, ids));
          const response = {};

          ids.forEach((id) => {
            const order = orders.find(
              (o) => o.customOrderId?.toString() === id || o.orderId === id
            );

            if (!order) {
              response[id] = { error: "Incorrect order ID" };
            } else {
              response[id] = {
                charge: order.charge,
                start_count: 0,
                status: formatProviderStatusDisplay(order),
                remains: order.quantity - (order.quantityDelivered || 0),
                currency: "USD",
              };
            }
          });

          return res.json(response);
        }

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
          status: formatProviderStatusDisplay(order),
          remains: order.quantity - (order.quantityDelivered || 0),
          currency: "USD",
        });
      }

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

        if (req.body.orders) {
          const ids = req.body.orders.toString().split(",").map((id) => id.trim());
          const results = [];

          for (const id of ids) {
            const result = await processRefill(id);
            results.push({ order: id, refill: result });
          }

          return res.json(results);
        }

        if (!req.body.order) {
          return res.json({ error: "Order ID required" });
        }

        const result = await processRefill(req.body.order.toString().trim());

        if (typeof result === "object") {
          return res.json(result);
        }

        return res.json({ refill: result });
      }

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

        if (req.body.refills) {
          const ids = req.body.refills.toString().split(",").map((id) => id.trim());
          const results = [];

          for (const id of ids) {
            const status = await getRefillStatus(id);
            results.push({ refill: id, status });
          }

          return res.json(results);
        }

        if (!req.body.refill) {
          return res.json({ error: "Refill ID required" });
        }

        const status = await getRefillStatus(req.body.refill.toString().trim());

        if (typeof status === "object") {
          return res.json(status);
        }

        return res.json({ status });
      }

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
