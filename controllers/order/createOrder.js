// controllers/order/createOrder.js

import Order from "../../models/Order.js";
import User from "../../models/User.js";
import Settings from "../../models/Settings.js";
import Wallet from "../../models/Wallet.js";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import { getNextOrderId } from "../../utils/orderId.js";
import {
  calculateBalance,
  ensureWallet,
  updateUserBalance,
} from "./helpers/wallet.js";
import { resolveService } from "./helpers/serviceResolver.js";
import { resolveProviderProfile } from "./helpers/provider.js";
import { resolveChildPanelData } from "./helpers/childPanel.js";
import { calculateOrderPricing } from "./helpers/pricing.js";

export const createOrder = async (req, res) => {
  try {
    const { category, service, link, quantity, comments } = req.body;

    if (!category || !service || !link) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // ─── RESOLVE SERVICE ───────────────────────────────────────────────────
    const serviceData = await resolveService({ service, req });

    if (!serviceData) {
      return res.status(404).json({ message: "Service not found" });
    }

    if (serviceData.visible === false) {
      return res.status(403).json({ message: "Service not available" });
    }

    const isCustomCommentsOrder =
      serviceData?.serviceType === "Custom Comments" ||
      serviceData?.serviceType === "Custom Comments Package";

    if (!isCustomCommentsOrder && !quantity) {
      return res.status(400).json({ message: "Quantity is required" });
    }

    if (isCustomCommentsOrder && (!comments || !comments.trim())) {
      return res.status(400).json({ message: "Comments are required for this service" });
    }

    const qty = isCustomCommentsOrder
      ? comments?.trim().split("\n").filter((l) => l.trim()).length || 0
      : Number(quantity);

    if (!isCustomCommentsOrder && qty <= 0) {
      return res.status(400).json({ message: "Invalid quantity" });
    }

    if (isCustomCommentsOrder && qty === 0) {
      return res.status(400).json({ message: "Please enter at least one comment" });
    }

    // ─── USER & WALLET ─────────────────────────────────────────────────────
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.isBlocked) return res.status(403).json({ message: "Account is blocked" });
    if (user.isFrozen) return res.status(403).json({ message: "Account is frozen" });

    const wallet = await ensureWallet(user._id);

    // ─── RESOLVE PROVIDER ──────────────────────────────────────────────────
    const providerResult = await resolveProviderProfile({ req, serviceData });
    if (!providerResult) {
      return res.status(400).json({ message: "Provider profile not found" });
    }
    const { effectiveProviderProfile, routeThroughMainPlatformApi } = providerResult;

    // ─── RESOLVE CHILD PANEL DATA ──────────────────────────────────────────
    const { childPanelOwnerId, childPanelPerOrderFee } =
      await resolveChildPanelData(user);

    // ─── PRICING ───────────────────────────────────────────────────────────
    let isFreeOrder = false;
    let finalCharge = 0;
    let baseCharge = 0;
    let systemCharge = 0;
    let resellerCommission = 0;
    let childPanelCommission = 0;

    if (serviceData.isFree) {
      isFreeOrder = true;

      const maxPerClaim = Number(serviceData.freeQuantity || 0);
      const cooldown = Number(serviceData.cooldownHours || 0);

      if (qty > maxPerClaim) {
        return res.status(400).json({ message: `Max free quantity is ${maxPerClaim}` });
      }

      if (cooldown > 0) {
        const lastOrder = await Order.findOne({
          userId: user._id,
          service,
          isFreeOrder: true,
        }).sort({ createdAt: -1 });

        if (lastOrder) {
          const hoursPassed = (Date.now() - new Date(lastOrder.createdAt)) / 3600000;
          if (hoursPassed < cooldown) {
            return res.status(400).json({
              message: `Try again in ${Math.ceil(cooldown - hoursPassed)}h`,
            });
          }
        }
      }
    } else {
      if (qty < serviceData.min || qty > serviceData.max) {
        return res.status(400).json({
          message: `Quantity must be ${serviceData.min}-${serviceData.max}`,
        });
      }

      const pricing = await calculateOrderPricing({
        serviceData,
        qty,
        user,
        childPanelOwnerId,
      });

      finalCharge = pricing.finalCharge;
      baseCharge = pricing.baseCharge;
      systemCharge = pricing.systemCharge ?? pricing.baseCharge;
      resellerCommission = pricing.resellerCommission;
      childPanelCommission = pricing.childPanelCommission;

      const currentBalance = calculateBalance(wallet.transactions);
      if (currentBalance < finalCharge) {
        return res.status(400).json({ message: "Insufficient balance" });
      }
    }

    // ─── CHARGE CP OWNER FOR FREE ORDERS ──────────────────────────────────
    if (isFreeOrder && childPanelOwnerId) {
      const providerRate = Number(serviceData.rate || 0);
      const cpOwnerBaseCharge = (qty / 1000) * providerRate;

      if (cpOwnerBaseCharge > 0) {
        const cpOwnerWallet = await Wallet.findOne({ user: childPanelOwnerId });

        if (!cpOwnerWallet) {
          return res.status(400).json({ message: "Child panel owner wallet not found" });
        }

        const cpOwnerBalance = calculateBalance(cpOwnerWallet.transactions);
        if (cpOwnerBalance < cpOwnerBaseCharge) {
          return res.status(400).json({ message: "Service temporarily unavailable" });
        }

        cpOwnerWallet.transactions.push({
          type: "Free Order Cost",
          amount: -Number(cpOwnerBaseCharge),
          status: "Completed",
          note: `Free order cost for end-user claim`,
          createdAt: new Date(),
        });

        cpOwnerWallet.balance = calculateBalance(cpOwnerWallet.transactions);
        await cpOwnerWallet.save();
        await updateUserBalance(childPanelOwnerId, cpOwnerWallet);
      }
    }

    // ─── ORDER ID ──────────────────────────────────────────────────────────
    const customOrderId = await getNextOrderId();

    // ─── DEDUCT USER WALLET ────────────────────────────────────────────────
    if (!isFreeOrder) {
      wallet.transactions.push({
        type: "Order",
        amount: -Number(finalCharge),
        status: "Completed",
        note: `Order #${customOrderId}`,
        createdAt: new Date(),
      });

      wallet.balance = calculateBalance(wallet.transactions);
      await wallet.save();
      await updateUserBalance(user._id, wallet);
    }

    // ─── DEDUCT BASE COST FROM CP OWNER (PAID ORDERS) ─────────────────────
    // If the CP owner can't cover the base cost:
    //   • Do NOT refund the end-user
    //   • Do NOT return an error to the end-user
    //   • Skip deducting the CP owner (balance stays where it is, never negative)
    //   • Set a flag so the provider call is skipped — order lands as "pending"
    //   • The order will sit pending until the CP owner tops up
    let cpOwnerInsufficientFunds = false;

    if (!isFreeOrder && childPanelOwnerId) {
      const cpOwnerWalletForPaid = await Wallet.findOne({ user: childPanelOwnerId });

      if (cpOwnerWalletForPaid) {
        const cpOwnerCurrentBalance = calculateBalance(cpOwnerWalletForPaid.transactions);

        // Deduct systemCharge (platform rate) when routing through platform API,
        // otherwise deduct baseCharge (raw provider cost) for CP's own providers.
        const cpOwnerDeduction = routeThroughMainPlatformApi ? systemCharge : baseCharge;

        if (cpOwnerCurrentBalance < cpOwnerDeduction) {
          cpOwnerInsufficientFunds = true;
        } else {
          cpOwnerWalletForPaid.transactions.push({
            type: "Order",
            amount: -Number(cpOwnerDeduction),
            status: "Completed",
            note: `CP end-user order cost #${customOrderId}`,
            createdAt: new Date(),
          });

          cpOwnerWalletForPaid.balance = calculateBalance(cpOwnerWalletForPaid.transactions);
          await cpOwnerWalletForPaid.save();
          await updateUserBalance(childPanelOwnerId, cpOwnerWalletForPaid);
        }
      }
    }

    // ─── CREATE ORDER ──────────────────────────────────────────────────────
    const order = await Order.create({
      orderId: "ORD-" + uuidv4().slice(0, 8),
      customOrderId,
      userId: orderUserId,
      endUserId: endUserId,
      comments: comments || "",

      resellerOwner: user.resellerOwner || null,
      resellerCommission,

      childPanelOwner: childPanelOwnerId,
      placedViaChildPanel: !!req.childPanel,
      childPanelCommission,
      childPanelEarningsCredited: false,
      childPanelPerOrderFee,

      category: serviceData.category,
      service: serviceData.name,
      serviceId: serviceData.serviceId || serviceData._id.toString(),
      rate: Number(serviceData.rate || 0),
      link,
      quantity: qty,
      charge: finalCharge,
      cpOwnerCharge: routeThroughMainPlatformApi ? systemCharge : baseCharge,
      adminProfit: isFreeOrder ? 0 : Number((finalCharge - baseCharge).toFixed(4)),
      status: "pending",
      isFreeOrder,
      earningsCredited: false,
      isCharged: !isFreeOrder,

      // ─── PROVIDER FIELDS ───────────────────────────────────────────────
      // When routing via the platform API, store the platform-layer identity:
      //   provider       → "Marine Panel" (not the upstream like "Nice")
      //   providerServiceId → platform's numeric serviceId (e.g. 1255)
      // This keeps admin-visible fields consistent with what was actually called.
      provider: routeThroughMainPlatformApi ? "Marine Panel" : serviceData.provider,
      providerApiUrl: effectiveProviderProfile.apiUrl,
      providerServiceId: routeThroughMainPlatformApi
        ? String(serviceData.serviceId)
        : serviceData.providerServiceId,
      providerProfileId: effectiveProviderProfile._id,

      cancelAllowed: serviceData.cancelAllowed,
      refillAllowed: serviceData.refillAllowed,

      refillPolicy: serviceData.refillAllowed
        ? serviceData.refillPolicy || "none"
        : "none",

      customRefillDays: serviceData.refillAllowed
        ? serviceData.refillPolicy === "custom"
          ? serviceData.customRefillDays || null
          : null
        : null,
    });

    // ─── PROVIDER CALL ────────────────────────────────────────────────────
    // Skip provider call entirely if the CP owner has insufficient funds.
    // The order stays "pending" — no error shown to the end-user.
    if (cpOwnerInsufficientFunds) {
      order.status = "pending";
      order.providerStatus = "pending";
      order.errorMessage = "CP owner insufficient funds — provider call skipped";
      await order.save();
    } else {
      try {
        if (routeThroughMainPlatformApi) {
          // Call the platform's own API endpoint.
          // Use serviceData.serviceId (the platform's numeric ID, e.g. 1255)
          // NOT serviceData.providerServiceId (the upstream provider's ID, e.g. 1247).
          const payload = new URLSearchParams();
          payload.append("key", effectiveProviderProfile.apiKey);
          payload.append("action", "add");
          payload.append("service", serviceData.serviceId);
          payload.append("link", link);

          if (isCustomCommentsOrder) {
            payload.append("comments", comments.trim());
          } else {
            payload.append("quantity", qty);
          }

          const response = await axios.post(effectiveProviderProfile.apiUrl, payload, {
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            timeout: 15000,
          });

          if (response?.data?.order) {
            order.providerOrderId = String(response.data.order);
            order.providerStatus = "processing";
            order.status = "processing";
          }
          order.providerResponse = response.data;
        } else {
          const providerPayload = {
            key: effectiveProviderProfile.apiKey,
            action: "add",
            service: serviceData.providerServiceId,
            link,
          };

          if (isCustomCommentsOrder) {
            if (comments?.trim()) providerPayload.comments = comments.trim();
          } else {
            providerPayload.quantity = qty;
          }

          const response = await axios.post(
            effectiveProviderProfile.apiUrl,
            providerPayload,
            { timeout: 15000 }
          );

          if (response?.data?.order) {
            order.providerOrderId = response.data.order;
            order.providerStatus = "processing";
            order.status = "processing";
          }
          order.providerResponse = response.data;
        }

        await order.save();
      } catch (err) {
        // ─── SAFE REFUND ON PROVIDER FAILURE ─────────────────────────────
        if (!isFreeOrder) {
          wallet.transactions.push({
            type: "Refund",
            amount: Number(finalCharge),
            status: "Completed",
            note: `Refund - Provider failed #${customOrderId}`,
            reference: order._id,
            createdAt: new Date(),
          });

          wallet.balance = calculateBalance(wallet.transactions);
          await wallet.save();
        }

        order.status = "failed";
        order.providerStatus = "failed";
        order.errorMessage = err.response?.data || err.message;
        order.refundProcessed = true;
        await order.save();

        return res.status(500).json({
          message: "Provider failed",
          error: err.response?.data || err.message,
        });
      }
    }

    // ─── ADMIN REVENUE ────────────────────────────────────────────────────
    if (!isFreeOrder) {
      const settings = await Settings.findOne();
      if (settings) {
        settings.totalRevenue += finalCharge - baseCharge;
        await settings.save();
      }
    }

    res.status(201).json({ order, balance: wallet.balance });
  } catch (error) {
    console.error("CREATE ORDER ERROR:", error);
    res.status(500).json({ message: "Order failed" });
  }
};
