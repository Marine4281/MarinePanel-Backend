// controllers/apiV2Controller.js

import User from "../models/User.js";
import Service from "../models/Service.js";
import Order from "../models/Order.js";
import Wallet from "../models/Wallet.js";
import Settings from "../models/Settings.js";
import ProviderProfile from "../models/ProviderProfile.js";
import axios from "axios";
import { getNextOrderId } from "../utils/orderId.js";
import { formatProviderStatusDisplay } from "../utils/providerStatusMapper.js";
import { callProvider } from "../utils/providerApi.js";
import {
  creditResellerCommission,
  creditChildPanelCommission,
  creditAdminRevenue,
  reverseResellerCommission,
  reverseChildPanelCommission,
  reverseAdminRevenue,
} from "./orderController.js";

const calculateBalance = (transactions = []) =>
  transactions.reduce((acc, t) => acc + (t.amount || 0), 0);

/* =========================================================
   ORDER QUERY HELPERS
   CP end-users' orders are stored under userId = cpOwner.
   So we match on BOTH userId and endUserId.
========================================================= */
const buildOrderQuery = (userId, rawId) => {
  const str = rawId?.toString().trim();
  const num = !isNaN(str) && str !== "" ? Number(str) : null;

  const idMatch = {
    $or: [
      ...(num !== null ? [{ customOrderId: num }] : []),
      { orderId: str },
    ],
  };

  return {
    $and: [
      { $or: [{ userId }, { endUserId: userId }] },
      idMatch,
    ],
  };
};

const buildMultiOrderQuery = (userId, rawIds) => {
  const numericIds = rawIds.filter((id) => !isNaN(id) && id !== "").map(Number);
  const stringIds = rawIds;

  const idMatch = {
    $or: [
      ...(numericIds.length ? [{ customOrderId: { $in: numericIds } }] : []),
      { orderId: { $in: stringIds } },
    ],
  };

  return {
    $and: [
      { $or: [{ userId }, { endUserId: userId }] },
      idMatch,
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

  // CP owners placing orders themselves are NOT end-users of any panel
  if (user.childPanelOwner && !user.isChildPanel) {
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

/* =========================================================
   🔧 HELPER: REFUND + REVERSE ON SUCCESSFUL CANCEL
   Same pattern as orderActionController.js's processCancelRefund —
   refunds the payer for whatever wasn't delivered, and reverses
   reseller/CP/admin commission proportionally.
========================================================= */
const processCancelRefund = async (order) => {
  if (order.isFreeOrder || !order.isCharged || order.refundProcessed) {
    return null;
  }

  const quantity = Number(order.quantity || 0);
  const delivered = Number(order.quantityDelivered || 0);
  const remaining = quantity - delivered;

  if (remaining <= 0) {
    order.refundProcessed = true;
    await order.save();
    return null;
  }

  const payerId = order.endUserId || order.userId;
  if (!payerId) return null;

  const wallet = await Wallet.findOne({ user: payerId });
  if (!wallet) return null;

  const alreadyRefunded = wallet.transactions.some(
    (t) => t.type === "Refund" && t.reference?.toString() === order._id.toString()
  );
  if (alreadyRefunded) {
    order.refundProcessed = true;
    await order.save();
    return null;
  }

  const charge = Number(order.charge || 0);
  const refundAmount = Number(((remaining / quantity) * charge).toFixed(4));

  if (refundAmount > 0) {
    wallet.transactions.push({
      type: "Refund",
      amount: refundAmount,
      status: "Completed",
      note: `Refund - Cancelled order #${order.customOrderId} (${remaining} undelivered)`,
      reference: order._id,
      createdAt: new Date(),
    });
    wallet.balance = calculateBalance(wallet.transactions);
    await wallet.save();
  }

  order.refundProcessed = true;
  await order.save();

  const ratio = charge > 0 ? refundAmount / charge : 1;
  await reverseResellerCommission(order, ratio);
  await reverseChildPanelCommission(order, ratio);
  await reverseAdminRevenue(order, ratio);

  return { refundAmount };
};

/* =========================================================
   🔧 HELPER: extract this order's cancel result out of a
   provider's batch-cancel response, whatever shape it comes
   back in (array of {order, cancel}, or object keyed by id).
========================================================= */
const extractCancelResult = (response, providerOrderId) => {
  if (Array.isArray(response)) {
    const match = response.find(
      (r) => String(r?.order) === String(providerOrderId)
    );
    if (!match) return null;
    return typeof match.cancel === "object" ? null : match.cancel;
  }

  if (response && typeof response === "object") {
    if (Object.prototype.hasOwnProperty.call(response, providerOrderId)) {
      const val = response[providerOrderId];
      return typeof val === "object" ? (val?.cancel ?? null) : val;
    }
    // Single-order shape fallback: { cancel: 1 }
    if ("cancel" in response) {
      return typeof response.cancel === "object" ? null : response.cancel;
    }
  }

  return null;
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
        if (user.childPanelOwner && !user.isChildPanel) {
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

        // ─── RESOLVE SERVICE ──────────────────────────────────────────────
        let selectedService;
        if (user.childPanelOwner && !user.isChildPanel) {
          // CP end-user: try CP's own service first, then platform service
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

        // ─── RESOLVE PROVIDER PROFILE EARLY ──────────────────────────────
        // Do this BEFORE charging anyone so we can bail out cleanly.
        let providerProfile = await ProviderProfile.findById(
          selectedService.providerProfileId
        );

        // Fallback: try matching by provider name on main-platform profiles
        if (!providerProfile && selectedService.provider && selectedService.provider !== "manual") {
          providerProfile = await ProviderProfile.findOne({
            name: selectedService.provider,
            cpOwner: null,
          });
        }

        if (!providerProfile || !providerProfile.apiUrl || !providerProfile.apiKey) {
          return res.json({ error: "Service provider not configured" });
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

        // ─── CHECK CP OWNER FUNDS BEFORE CHARGING ANYONE ─────────────────
        const baseCharge = Number(((qty / 1000) * providerRate).toFixed(4));
        let cpOwnerWallet = null;

        if (childPanelOwnerId && baseCharge > 0) {
          cpOwnerWallet = await Wallet.findOne({ user: childPanelOwnerId });
          const cpOwnerBalance = cpOwnerWallet ? calculateBalance(cpOwnerWallet.transactions) : 0;

          if (cpOwnerBalance < baseCharge) {
            return res.json({ error: "Service temporarily unavailable" });
          }
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
        if (cpOwnerWallet && baseCharge > 0) {
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

        // ─── IDENTITY: CP end-users appear as the CP owner to the platform ─
        const isCpEndUser = !!childPanelOwnerId && !user.isChildPanel;
        const orderUserId = isCpEndUser ? childPanelOwnerId : user._id;
        const endUserId = isCpEndUser ? user._id : null;

        // ─── CREATE ORDER ─────────────────────────────────────────────────
        const order = await Order.create({
          userId: orderUserId,
          endUserId,
          customOrderId,
          category: selectedService.category,
          service: selectedService.name,
          serviceId: selectedService.serviceId,
          link,
          quantity: qty,
          charge: finalCharge,
          rate: Number(selectedService.rate || 0),
          isCharged: true,

          adminProfit: Number((finalCharge - baseCharge).toFixed(4)),
          adminRevenueCredited: false,

          resellerOwner: resellerOwnerId,
          resellerCommission,
          earningsCredited: false,

          childPanelOwner: childPanelOwnerId,
          childPanelCommission,
          childPanelEarningsCredited: false,
          childPanelPerOrderFee,

          providerProfileId: providerProfile._id,
          provider: selectedService.provider,
          providerServiceId: selectedService.providerServiceId,
          providerApiUrl: providerProfile.apiUrl,

          cancelAllowed: selectedService.cancelAllowed,
          refillAllowed: selectedService.refillAllowed,
          refillPolicy: selectedService.refillPolicy,
          customRefillDays: selectedService.customRefillDays,
        });

        // ─── INSTANT COMMISSION + REVENUE ACCRUAL ─────────────────────────
        // Same instant-credit model as the web order flow: the end user
        // (and CP owner, if any) has already been charged above, so credit
        // reseller/CP/admin now. If the provider call below fails, this is
        // reversed in the catch block.
        await creditResellerCommission(order);
        await creditChildPanelCommission(order);
        await creditAdminRevenue(order);

        // ─── CALL PROVIDER ────────────────────────────────────────────────
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
          }

          order.providerStatus = "processing";
          order.status = "processing";
          order.providerResponse = providerRes.data;
          await order.save();

        } catch (providerErr) {
          console.error("Provider call failed:", providerErr.message);

          // Refund end-user
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

          // Refund CP owner base cost if applicable
          if (cpOwnerWallet && baseCharge > 0) {
            cpOwnerWallet.transactions.push({
              type: "Refund",
              amount: baseCharge,
              status: "Completed",
              note: `Refund - Provider failed #${customOrderId}`,
              createdAt: new Date(),
            });
            cpOwnerWallet.balance = calculateBalance(cpOwnerWallet.transactions);
            await cpOwnerWallet.save();
          }

          // Reverse commission/revenue credited above — provider call
          // never went through, so nothing was actually delivered.
          await reverseResellerCommission(order, 1);
          await reverseChildPanelCommission(order, 1);
          await reverseAdminRevenue(order, 1);

          order.status = "failed";
          order.providerStatus = "failed";
          order.refundProcessed = true;
          await order.save();

          return res.json({ error: "Provider failed. Your balance has been refunded." });
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
            $and: [
              { $or: [{ userId: user._id }, { endUserId: user._id }] },
              {
                $or: [
                  { refillId: str },
                  ...(num !== null ? [{ customOrderId: num }] : []),
                  { orderId: str },
                ],
              },
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
        const results = {}; // id → result, filled in as we go

        // ─── LOAD & VALIDATE EACH ORDER ─────────────────────────────────
        const eligibleOrders = []; // { id, order }

        for (const id of ids) {
          const order = await Order.findOne(buildOrderQuery(user._id, id));

          if (!order) {
            results[id] = { error: "Incorrect order ID" };
            continue;
          }

          if (!order.cancelAllowed) {
            results[id] = { error: "Cancel not allowed" };
            continue;
          }

          if (["completed", "cancelled", "refunded"].includes(order.status)) {
            results[id] = { error: "Order cannot be cancelled" };
            continue;
          }

          const providerOrderId = String(order.providerOrderId || "").trim();
          if (!providerOrderId) {
            results[id] = { error: "Invalid provider order ID" };
            continue;
          }

          eligibleOrders.push({ id, order, providerOrderId });
        }

        // ─── GROUP BY PROVIDER PROFILE (batch cancel per provider) ───────
        const grouped = {};
        for (const entry of eligibleOrders) {
          const key = String(entry.order.providerProfileId || "");
          if (!grouped[key]) grouped[key] = [];
          grouped[key].push(entry);
        }

        for (const profileId of Object.keys(grouped)) {
          const group = grouped[profileId];
          const providerProfile = await ProviderProfile.findById(profileId);

          if (!providerProfile || !providerProfile.apiUrl || !providerProfile.apiKey) {
            for (const { id } of group) {
              results[id] = { error: "Provider not configured" };
            }
            continue;
          }

          let providerResponse;
          try {
            providerResponse = await callProvider(providerProfile, {
              action: "cancel",
              orders: group.map((g) => g.providerOrderId).join(","),
            });
          } catch (err) {
            console.error("Batch cancel provider error:", err);
            for (const { id } of group) {
              results[id] = { error: "Provider request failed" };
            }
            continue;
          }

          // ─── APPLY RESULT PER ORDER ─────────────────────────────────
          for (const { id, order, providerOrderId } of group) {
            const cancelResult = extractCancelResult(providerResponse, providerOrderId);
            const isSuccess = cancelResult === 1 || cancelResult === true;

            order.cancelRequested = true;
            order.cancelRequestedAt = new Date();
            order.cancelStatus = isSuccess ? "success" : "failed";
            order.cancelProcessed = true;
            order.cancelResponse = providerResponse;

            if (isSuccess) {
              order.status = "cancelled";
            }

            await order.save();

            if (isSuccess) {
              await processCancelRefund(order);
              results[id] = 1;
            } else {
              results[id] = { error: "Cancel request failed" };
            }
          }
        }

        // Return in cancel: { order, cancel } array shape matching the ids order
        return res.json(
          ids.map((id) => ({ order: id, cancel: results[id] ?? { error: "Cancel not processed" } }))
        );
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
