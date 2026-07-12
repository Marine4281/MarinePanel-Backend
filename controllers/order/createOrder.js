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
    // Now also resolves CP owner through the reseller → CP chain
    const { childPanelOwnerId, childPanelPerOrderFee } =
      await resolveChildPanelData(user);

    // ─── IDENTITY: order appears as the owner's, not the end-user's ────────
    const isEndUserOnCpDomain =
      req.childPanel &&
      req.user &&
      req.childPanel._id.toString() !== req.user._id.toString();

    let orderUserId = user._id;
    let endUserId = null;

    if (isEndUserOnCpDomain) {
      // Direct CP end-user — order appears as the CP owner's
      orderUserId = req.childPanel._id;
      endUserId = user._id;
    } else if (user.resellerOwner && !childPanelOwnerId) {
      // Standalone reseller end-user (reseller NOT under any CP) — order
      // appears as the reseller owner's. Deliberately excluded when
      // childPanelOwnerId is set: cpOwnerOrderController.js already has
      // bespoke handling that expects endUserId to stay null and
      // resellerOwner to be set for CP-reseller end-user orders
      // (see isResellerEndUserOrder there) — flipping this too would
      // break that dashboard's "my order vs reseller order" view.
      orderUserId = user.resellerOwner;
      endUserId = user._id;
    }

    // ─── Determine if this service originates from the main platform ──
    const isMainPlatformService =
      !serviceData.cpOwner ||
      serviceData.provider === "platform";

    // ─── PRICING ───────────────────────────────────────────────────────────
    let isFreeOrder = false;
    let finalCharge = 0;
    let baseCharge = 0;
    let systemCharge = 0;
    let resellerCommission = 0;
    let childPanelCommission = 0;
    let resellerChargeAmount = 0; // ← NEW: wholesale cost owed by reseller owner

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
      resellerChargeAmount = pricing.resellerChargeAmount; // ← NEW

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
    let cpOwnerInsufficientFunds = false;

    if (!isFreeOrder && childPanelOwnerId) {
      const cpOwnerWalletForPaid = await Wallet.findOne({ user: childPanelOwnerId });

      if (cpOwnerWalletForPaid) {
        const cpOwnerCurrentBalance = calculateBalance(cpOwnerWalletForPaid.transactions);
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

    // ─── DEDUCT BASE COST FROM RESELLER OWNER (PAID ORDERS) ───────────────
    // ← NEW: mirrors the CP owner block above. The end user already paid
    // the full marked-up price into their own wallet; the reseller owner
    // now pays the wholesale cost (pre-reseller-markup) out of their own
    // wallet, keeping their markup as retained profit automatically.
    let resellerOwnerInsufficientFunds = false;

    if (!isFreeOrder && user.resellerOwner) {
      const resellerWalletForPaid = await Wallet.findOne({ user: user.resellerOwner });

      if (resellerWalletForPaid) {
        const resellerCurrentBalance = calculateBalance(resellerWalletForPaid.transactions);

        if (resellerCurrentBalance < resellerChargeAmount) {
          resellerOwnerInsufficientFunds = true;
        } else {
          resellerWalletForPaid.transactions.push({
            type: "Order",
            amount: -Number(resellerChargeAmount),
            status: "Completed",
            note: `Reseller end-user order cost #${customOrderId}`,
            createdAt: new Date(),
          });

          resellerWalletForPaid.balance = calculateBalance(resellerWalletForPaid.transactions);
          await resellerWalletForPaid.save();
          await updateUserBalance(user.resellerOwner, resellerWalletForPaid);
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
      resellerOwnerCharge: resellerChargeAmount, // ← NEW

      childPanelOwner: childPanelOwnerId,
      placedViaChildPanel: !!childPanelOwnerId,
      childPanelCommission,
      childPanelEarningsCredited: false,
      childPanelPerOrderFee,

      isMainPlatformService,

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
    if (cpOwnerInsufficientFunds || resellerOwnerInsufficientFunds) {
      // ← NEW: combined gate
      order.status = "pending";
      order.providerStatus = "pending";
      order.errorMessage = "Upstream owner insufficient funds — provider call skipped";
      await order.save();
    } else {
      try {
        if (routeThroughMainPlatformApi) {
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
        if (!isFreeOrder) {
          // Refund end user
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

          // ← NEW: Refund CP owner (their wholesale deduction, if any)
          if (childPanelOwnerId) {
            const cpOwnerDeduction = routeThroughMainPlatformApi ? systemCharge : baseCharge;
            const cpOwnerWalletForRefund = await Wallet.findOne({ user: childPanelOwnerId });

            if (cpOwnerWalletForRefund && cpOwnerDeduction > 0) {
              cpOwnerWalletForRefund.transactions.push({
                type: "Refund",
                amount: Number(cpOwnerDeduction),
                status: "Completed",
                note: `Refund - Provider failed #${customOrderId}`,
                reference: order._id,
                createdAt: new Date(),
              });

              cpOwnerWalletForRefund.balance = calculateBalance(cpOwnerWalletForRefund.transactions);
              await cpOwnerWalletForRefund.save();
              await updateUserBalance(childPanelOwnerId, cpOwnerWalletForRefund);
            }
          }

          // ← NEW: Refund reseller owner (their wholesale deduction, if any)
          if (user.resellerOwner) {
            const resellerWalletForRefund = await Wallet.findOne({ user: user.resellerOwner });

            if (resellerWalletForRefund && resellerChargeAmount > 0) {
              resellerWalletForRefund.transactions.push({
                type: "Refund",
                amount: Number(resellerChargeAmount),
                status: "Completed",
                note: `Refund - Provider failed #${customOrderId}`,
                reference: order._id,
                createdAt: new Date(),
              });

              resellerWalletForRefund.balance = calculateBalance(resellerWalletForRefund.transactions);
              await resellerWalletForRefund.save();
              await updateUserBalance(user.resellerOwner, resellerWalletForRefund);
            }
          }
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
