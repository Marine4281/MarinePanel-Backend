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

    if (
      serviceData?.serviceType === "Custom Comments" &&
      (!comments || !comments.trim())
    ) {
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

    // ─── RESOLVE PROVIDER ─────────────────────────────────────────────────
    const providerResult = await resolveProviderProfile({ req, serviceData });
    if (!providerResult) {
      return res.status(400).json({ message: "Provider profile not found" });
    }
    const { effectiveProviderProfile, routeThroughMainPlatformApi } = providerResult;

    // ─── RESOLVE CHILD PANEL DATA ─────────────────────────────────────────
    const { childPanelOwnerId, childPanelPerOrderFee } =
      await resolveChildPanelData(user);

    // ─── REJECT IF CP OWNER IS IN NEGATIVE BALANCE ────────────────────────
    // New orders are blocked when the CP owner owes the main platform money.
    // Already in-flight orders complete normally — only new ones are gated.
    // The end-user sees a generic message; the real reason is internal.
    if (childPanelOwnerId) {
      const cpOwner = await User.findById(childPanelOwnerId).select("childPanelNegativeBalance");
      if (cpOwner?.childPanelNegativeBalance) {
        return res.status(402).json({ message: "Service temporarily unavailable" });
      }
    }

    // ─── PRICING ──────────────────────────────────────────────────────────
    let isFreeOrder = false;
    let finalCharge = 0;
    let baseCharge = 0;
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
      resellerCommission = pricing.resellerCommission;
      childPanelCommission = pricing.childPanelCommission;

      const currentBalance = calculateBalance(wallet.transactions);
      if (currentBalance < finalCharge) {
        return res.status(400).json({ message: "Insufficient balance" });
      }
    }

    // ─── CHARGE CP OWNER FOR FREE ORDERS ─────────────────────────────────
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

    // ─── ORDER ID ─────────────────────────────────────────────────────────
    const customOrderId = await getNextOrderId();

    // ─── DEDUCT USER WALLET ───────────────────────────────────────────────
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

    // ─── DEDUCT BASE COST FROM CP OWNER (PAID ORDERS) ────────────────────
    // No upfront balance check here — CP owner operates on credit from the
    // main platform. If they go negative, we flag their account so future
    // orders are rejected until they top up. This mirrors how provider APIs
    // treat underfunded panels: they reject on their side, not the end-user's.
    if (!isFreeOrder && childPanelOwnerId) {
      const cpOwnerWalletForPaid = await Wallet.findOne({ user: childPanelOwnerId });

      if (cpOwnerWalletForPaid) {
        cpOwnerWalletForPaid.transactions.push({
          type: "Order",
          amount: -Number(baseCharge),
          status: "Completed",
          note: `CP end-user order cost #${customOrderId}`,
          createdAt: new Date(),
        });

        cpOwnerWalletForPaid.balance = calculateBalance(cpOwnerWalletForPaid.transactions);
        await cpOwnerWalletForPaid.save();
        await updateUserBalance(childPanelOwnerId, cpOwnerWalletForPaid);

        // Flag the CP owner if they've gone into negative so the main platform
        // admin can act and future orders are gated until they top up.
        if (cpOwnerWalletForPaid.balance < 0) {
          await User.findByIdAndUpdate(childPanelOwnerId, {
            childPanelNegativeBalance: true,
          });
        }
      }
    }

    // ─── CREATE ORDER ─────────────────────────────────────────────────────
    const order = await Order.create({
      orderId: "ORD-" + uuidv4().slice(0, 8),
      customOrderId,
      userId: user._id,
      comments: comments || "",

      resellerOwner: user.resellerOwner || null,
      resellerCommission,

      childPanelOwner: childPanelOwnerId,
      placedViaChildPanel: !!req.childPanel,
      childPanelCommission,
      childPanelEarningsCredited: false,
      childPanelPerOrderFee,

      category: serviceData.category,
      service,
      serviceId: serviceData.serviceId || serviceData._id.toString(),
      rate: Number(serviceData.rate || 0),
      link,
      quantity: qty,
      charge: finalCharge,
      adminProfit: isFreeOrder ? 0 : Number((finalCharge - baseCharge).toFixed(4)),
      status: "pending",
      isFreeOrder,
      earningsCredited: false,
      isCharged: !isFreeOrder,

      provider: serviceData.provider,
      providerApiUrl: effectiveProviderProfile.apiUrl,
      providerServiceId: serviceData.providerServiceId,
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
    try {
      if (routeThroughMainPlatformApi) {
        const payload = new URLSearchParams();
        payload.append("key", effectiveProviderProfile.apiKey);
        payload.append("action", "add");
        payload.append("service", serviceData.providerServiceId); // provider's own ID, not internal
        payload.append("link", link);

        // Custom comments services send comments instead of quantity
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

        if (serviceData.serviceType !== "Custom Comments") {
          providerPayload.quantity = qty;
        }
        if (serviceData.serviceType === "Custom Comments" && comments?.trim()) {
          providerPayload.comments = comments.trim();
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
