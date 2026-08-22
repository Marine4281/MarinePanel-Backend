import axios from "axios";
import Service from "../../../models/Service.js";
import Order from "../../../models/Order.js";
import Wallet from "../../../models/Wallet.js";
import User from "../../../models/User.js";
import ProviderProfile from "../../../models/ProviderProfile.js";
import { getNextOrderId } from "../../../utils/orderId.js";
import {
  calculateBalance,
  ensureWallet,
  updateUserBalance,
} from "../../order/helpers/wallet.js";
import { resolveChildPanelData } from "../../order/helpers/childPanel.js";
import { calculateOrderPricing } from "../../order/helpers/pricing.js";
import {
  creditResellerCommission,
  creditChildPanelCommission,
  creditAdminRevenue,
  reverseResellerCommission,
  reverseChildPanelCommission,
  reverseAdminRevenue,
} from "../../orderController.js";

export const handleAdd = async (req, res, user) => {
  const { service, link, quantity, comments } = req.body;

  if (!service || !link) {
    return res.json({ error: "Missing required fields" });
  }

  // ─── RESOLVE SERVICE ──────────────────────────────────────────────
  let selectedService;
  if (user.isChildPanel) {
    selectedService = await Service.findOne({
      serviceId: service,
      status: true,
      cpOwner: user._id,
    });
  } else if (user.childPanelOwner) {
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

  // ─── CUSTOM COMMENTS HANDLING ──────────────────────────────────────
  const isCustomCommentsOrder =
    selectedService.serviceType === "Custom Comments" ||
    selectedService.serviceType === "Custom Comments Package";

  if (!isCustomCommentsOrder && !quantity) {
    return res.json({ error: "Missing required fields" });
  }

  if (isCustomCommentsOrder && (!comments || !comments.trim())) {
    return res.json({ error: "Comments are required for this service" });
  }

  const qty = isCustomCommentsOrder
    ? comments?.trim().split("\n").filter((l) => l.trim()).length || 0
    : Number(quantity);

  if (isCustomCommentsOrder && qty === 0) {
    return res.json({ error: "Please enter at least one comment" });
  }

  if (!isCustomCommentsOrder && qty <= 0) {
    return res.json({ error: "Invalid quantity" });
  }

  // ─── BLOCK DUPLICATE ACTIVE ORDER FOR SAME LINK + SAME SERVICE ────
  // Scoped to this service only — the same link can still be ordered
  // for a different service while an order on another service is active.
  const existingActiveOrder = await Order.findOne({
    link,
    serviceId: selectedService.serviceId,
    status: { $in: ["pending", "processing"] },
    $or: [
      { endUserId: user._id },
      { endUserId: null, userId: user._id },
    ],
  }).lean();

  if (existingActiveOrder) {
    return res.json({
      error:
        "You have an active order with this link for this service. Please wait until it is completed.",
    });
  }

  // ─── RESOLVE PROVIDER PROFILE EARLY ──────────────────────────────
  let providerProfile;
  let providerServiceId = selectedService.providerServiceId;
  let routeThroughMainPlatformApi = false;

  if (selectedService.provider === "platform") {
    // CP-imported platform service — providerServiceId currently holds
    // the source admin Service._id, not a real upstream service id.
    const sourceService = await Service.findById(selectedService.providerServiceId);
    if (sourceService) {
      providerProfile = await ProviderProfile.findById(sourceService.providerProfileId);
      providerServiceId = sourceService.providerServiceId;
    }
  } else {
    providerProfile = await ProviderProfile.findById(selectedService.providerProfileId);

    if (!providerProfile && selectedService.provider && selectedService.provider !== "manual") {
      providerProfile = await ProviderProfile.findOne({
        name: selectedService.provider,
        cpOwner: selectedService.cpOwner || null,
      });
    }
  }

  if (!providerProfile || !providerProfile.apiUrl || !providerProfile.apiKey) {
    return res.json({ error: "Service provider not configured" });
  }

  if (!isCustomCommentsOrder && (qty < selectedService.min || qty > selectedService.max)) {
    return res.json({
      error: `Quantity must be between ${selectedService.min} and ${selectedService.max}`,
    });
  }

  // ─── RESOLVE CHILD PANEL OWNERSHIP (walks reseller → CP chain too) ─
  const { childPanelOwnerId, childPanelPerOrderFee } =
    await resolveChildPanelData(user);

  // ─── PRICING (same helper createOrder.js uses) ────────────────────
  const {
    finalCharge,
    baseCharge,
    systemCharge,
    resellerCommission,
    childPanelCommission,
    resellerChargeAmount,
  } = await calculateOrderPricing({
    serviceData: selectedService,
    qty,
    user,
    childPanelOwnerId,
  });

  const resellerOwnerId = user.resellerOwner || null;
  const cpOwnerDeduction = routeThroughMainPlatformApi ? systemCharge : baseCharge;

  const wallet = await ensureWallet(user._id);

  if (calculateBalance(wallet.transactions) < finalCharge) {
    return res.json({ error: "Insufficient balance" });
  }

  // ─── CHECK CP OWNER FUNDS BEFORE CHARGING ANYONE ─────────────────
  let cpOwnerWallet = null;

  if (childPanelOwnerId && cpOwnerDeduction > 0) {
    cpOwnerWallet = await Wallet.findOne({ user: childPanelOwnerId });
    const cpOwnerBalance = cpOwnerWallet ? calculateBalance(cpOwnerWallet.transactions) : 0;

    if (cpOwnerBalance < cpOwnerDeduction) {
      return res.json({ error: "Service temporarily unavailable" });
    }
  }

  // ─── CHECK RESELLER OWNER FUNDS BEFORE CHARGING ANYONE ───────────
  let resellerOwnerWallet = null;

  if (resellerOwnerId && resellerChargeAmount > 0) {
    resellerOwnerWallet = await Wallet.findOne({ user: resellerOwnerId });
    const resellerBalance = resellerOwnerWallet
      ? calculateBalance(resellerOwnerWallet.transactions)
      : 0;

    if (resellerBalance < resellerChargeAmount) {
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
  await updateUserBalance(user._id, wallet);

  // ─── DEDUCT BASE COST FROM CP OWNER ──────────────────────────────
  if (cpOwnerWallet && cpOwnerDeduction > 0) {
    cpOwnerWallet.transactions.push({
      type: "Order",
      amount: -cpOwnerDeduction,
      status: "Completed",
      note: `CP end-user API order cost #${customOrderId}`,
      createdAt: new Date(),
    });
    cpOwnerWallet.balance = calculateBalance(cpOwnerWallet.transactions);
    await cpOwnerWallet.save();
    await updateUserBalance(childPanelOwnerId, cpOwnerWallet);
  }

  // ─── DEDUCT WHOLESALE COST FROM RESELLER OWNER ───────────────────
  if (resellerOwnerWallet && resellerChargeAmount > 0) {
    resellerOwnerWallet.transactions.push({
      type: "Order",
      amount: -resellerChargeAmount,
      status: "Completed",
      note: `Reseller end-user API order cost #${customOrderId}`,
      createdAt: new Date(),
    });
    resellerOwnerWallet.balance = calculateBalance(resellerOwnerWallet.transactions);
    await resellerOwnerWallet.save();
    await updateUserBalance(resellerOwnerId, resellerOwnerWallet);
  }

  // ─── IDENTITY: CP/reseller end-users appear as the owner to the platform ─
  let orderUserId = user._id;
  let endUserId = null;

  if (childPanelOwnerId && !user.isChildPanel) {
    orderUserId = childPanelOwnerId;
    endUserId = user._id;
  } else if (resellerOwnerId && !childPanelOwnerId) {
    orderUserId = resellerOwnerId;
    endUserId = user._id;
  }

  const isMainPlatformService =
    !selectedService.cpOwner || selectedService.provider === "platform";

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
    comments: isCustomCommentsOrder ? comments.trim() : undefined,
    charge: finalCharge,
    rate: Number(selectedService.rate || 0),
    isCharged: true,

    orderSource: "api",

    isMainPlatformService,
    placedViaChildPanel: !!childPanelOwnerId,

    adminProfit: Number((finalCharge - baseCharge).toFixed(4)),
    adminRevenueCredited: false,

    resellerOwner: resellerOwnerId,
    resellerCommission,
    resellerOwnerCharge: resellerChargeAmount,
    earningsCredited: false,

    childPanelOwner: childPanelOwnerId,
    childPanelCommission,
    childPanelEarningsCredited: false,
    childPanelPerOrderFee,
    cpOwnerCharge: cpOwnerDeduction,

    providerProfileId: providerProfile._id,
    provider: selectedService.provider,
    providerServiceId: providerServiceId,
    providerApiUrl: providerProfile.apiUrl,

    cancelAllowed: selectedService.cancelAllowed,
    refillAllowed: selectedService.refillAllowed,
    refillPolicy: selectedService.refillPolicy,
    customRefillDays: selectedService.customRefillDays,
  });

  // ─── INSTANT COMMISSION + REVENUE ACCRUAL ─────────────────────────
  await creditResellerCommission(order);
  await creditChildPanelCommission(order);
  await creditAdminRevenue(order);

  // ─── CHILD PANEL BILLING: count this order toward the owner's cycle ──
  if (childPanelOwnerId) {
    await User.findByIdAndUpdate(childPanelOwnerId, {
      $inc: { childPanelOrdersThisCycle: 1 },
    });
  }

  // ─── CALL PROVIDER ────────────────────────────────────────────────
  try {
    const payload = {
      key: providerProfile.apiKey,
      action: "add",
      service: providerServiceId,
      link,
    };

    if (isCustomCommentsOrder) {
      payload.comments = comments.trim();
    } else {
      payload.quantity = qty;
    }

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
    await updateUserBalance(user._id, wallet);

    if (cpOwnerWallet && cpOwnerDeduction > 0) {
      cpOwnerWallet.transactions.push({
        type: "Refund",
        amount: cpOwnerDeduction,
        status: "Completed",
        note: `Refund - Provider failed #${customOrderId}`,
        createdAt: new Date(),
      });
      cpOwnerWallet.balance = calculateBalance(cpOwnerWallet.transactions);
      await cpOwnerWallet.save();
      await updateUserBalance(childPanelOwnerId, cpOwnerWallet);
    }

    if (resellerOwnerWallet && resellerChargeAmount > 0) {
      resellerOwnerWallet.transactions.push({
        type: "Refund",
        amount: resellerChargeAmount,
        status: "Completed",
        note: `Refund - Provider failed #${customOrderId}`,
        createdAt: new Date(),
      });
      resellerOwnerWallet.balance = calculateBalance(resellerOwnerWallet.transactions);
      await resellerOwnerWallet.save();
      await updateUserBalance(resellerOwnerId, resellerOwnerWallet);
    }

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
};
