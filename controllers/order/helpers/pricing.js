// controllers/order/helpers/pricing.js

import Settings from "../../../models/Settings.js";
import User from "../../../models/User.js";

export const calculateOrderPricing = async ({
  serviceData,
  qty,
  user,
  childPanelOwnerId,
}) => {
  const providerRate = Number(serviceData.rate || 0);

  let finalRate;
  let systemCharge;
  let resellerCommission = 0;
  let childPanelCommission = 0;

  if (serviceData.cpOwner) {
    const cpOwnerId = childPanelOwnerId || serviceData.cpOwner;
    const cpOwner = cpOwnerId ? await User.findById(cpOwnerId) : null;

    const cpCommissionRate = Number(cpOwner?.childPanelCommissionRate || 0);

    const cpFinalRate = providerRate + (providerRate * cpCommissionRate) / 100;
    finalRate = cpFinalRate;

    // CP's own service — no platform layer between CP and provider
    systemCharge = (qty / 1000) * providerRate;

    if (cpOwner && cpCommissionRate > 0) {
      childPanelCommission = (qty / 1000) * (cpFinalRate - providerRate);
    }

    // Reseller markup is layered on TOP of the CP owner's final rate
    if (user.resellerOwner) {
      const reseller = await User.findById(user.resellerOwner);
      const resellerRate = Number(reseller?.resellerCommissionRate || 0);

      if (resellerRate > 0) {
        const resellerFinalRate = cpFinalRate + (cpFinalRate * resellerRate) / 100;
        resellerCommission = (qty / 1000) * (resellerFinalRate - cpFinalRate);
        finalRate = resellerFinalRate;
      }
    }
  } else {
    const settings = await Settings.findOne().lean();
    const globalRate = Number(settings?.commission || 0);

    // ─── COMMISSION OVERRIDE HIERARCHY ─────────────────────────────────
    // 1. Per-service override on the service itself
    // 2. Per-category override in settings.categoryCommissions
    // 3. Per-user (commissionOverride on user)
    // 4. Global commission
    let adminRate;

    if (serviceData.commissionOverride != null) {
      // Service-level override wins
      adminRate = Number(serviceData.commissionOverride);
    } else if (
      serviceData.category &&
      settings?.categoryCommissions &&
      settings.categoryCommissions[serviceData.category] != null
    ) {
      // Category-level override
      adminRate = Number(settings.categoryCommissions[serviceData.category]);
    } else if (user.commissionOverride != null) {
      // Per-user override (existing behaviour)
      adminRate = Number(user.commissionOverride);
    } else {
      // Global fallback
      adminRate = globalRate;
    }
    // ────────────────────────────────────────────────────────────────────

    // 1. Admin's final rate
    const adminFinalRate = providerRate + (providerRate * adminRate) / 100;
    finalRate = adminFinalRate;

    // Platform sell rate × qty — what the platform charges the CP owner
    systemCharge = (qty / 1000) * adminFinalRate;

    // 2. CP owner's final rate — markup on top of admin's final rate
    let cpFinalRate = adminFinalRate;

    if (childPanelOwnerId) {
      const cpOwner = await User.findById(childPanelOwnerId);
      const cpCommissionRate = Number(cpOwner?.childPanelCommissionRate || 0);

      if (cpCommissionRate > 0) {
        cpFinalRate = adminFinalRate + (adminFinalRate * cpCommissionRate) / 100;
        childPanelCommission = (qty / 1000) * (cpFinalRate - adminFinalRate);
      }
    }
    finalRate = cpFinalRate;

    // 3. Reseller's final rate — markup on top of CP owner's final rate
    //    (or on top of admin's final rate, if there's no CP in the chain)
    if (user.resellerOwner) {
      const reseller = await User.findById(user.resellerOwner);
      const resellerRate = Number(reseller?.resellerCommissionRate || 0);

      if (resellerRate > 0) {
        const resellerFinalRate = cpFinalRate + (cpFinalRate * resellerRate) / 100;
        resellerCommission = (qty / 1000) * (resellerFinalRate - cpFinalRate);
        finalRate = resellerFinalRate;
      }
    }
  }

  const finalCharge = (qty / 1000) * finalRate;
  const baseCharge = (qty / 1000) * providerRate;

  return {
    finalCharge,
    baseCharge,
    systemCharge,
    finalRate,
    resellerCommission,
    childPanelCommission,
  };
};
