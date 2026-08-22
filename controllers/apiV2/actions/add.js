import axios from "axios";
import Service from "../../../models/Service.js";
import Order from "../../../models/Order.js";
import Wallet from "../../../models/Wallet.js";
import User from "../../../models/User.js";
import ProviderProfile from "../../../models/ProviderProfile.js";
import { getNextOrderId } from "../../../utils/orderId.js";
import { calculateBalance } from "../helpers/balance.js";
import { resolveRateAndOwnership } from "../helpers/rateAndOwnership.js";
import {
  creditResellerCommission,
  creditChildPanelCommission,
  creditAdminRevenue,
  reverseResellerCommission,
  reverseChildPanelCommission,
  reverseAdminRevenue,
} from "../../orderController.js";

export const handleAdd = async (req, res, user) => {
  const { service, link, quantity } = req.body;

  if (!service || !link || !quantity) {
    return res.json({ error: "Missing required fields" });
  }

  // ─── RESOLVE SERVICE ──────────────────────────────────────────────
  let selectedService;
  if (user.isChildPanel) {
    // CP owner's own key — their own catalog only
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

  // ─── RESOLVE PROVIDER PROFILE EARLY ──────────────────────────────
  let providerProfile;
  let providerServiceId = selectedService.providerServiceId;

  if (selectedService.provider === "platform") {
    // CP-imported platform service — providerServiceId currently holds
    // the source admin Service._id, not a real upstream service id.
    // Look up the source service to get the real provider + real
    // upstream service id, otherwise the provider call below would be
    // sent an invalid service id.
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

  const qty = Number(quantity);

  if (qty < selectedService.min || qty > selectedService.max) {
    return res.json({
      error: `Quantity must be between ${selectedService.min} and ${selectedService.max}`,
    });
  }

  const {
    finalCharge,
    baseCharge,
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

    orderSource: "api",

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
