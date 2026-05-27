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
  let resellerCommission = 0;
  let childPanelCommission = 0;

  if (serviceData.cpOwner) {
    const cpOwnerId = childPanelOwnerId || serviceData.cpOwner;
    const cpOwner = cpOwnerId ? await User.findById(cpOwnerId) : null;

    const cpCommissionRate = Number(cpOwner?.childPanelCommissionRate || 0);

    finalRate = providerRate + (providerRate * cpCommissionRate) / 100;

    if (cpOwner && cpCommissionRate > 0) {
      childPanelCommission = (qty / 1000) * (finalRate - providerRate);
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

    const systemRate = providerRate + (providerRate * adminRate) / 100;
    finalRate = systemRate;

    if (user.resellerOwner) {
      const reseller = await User.findById(user.resellerOwner);
      const resellerRate = Number(reseller?.resellerCommissionRate || 0);

      finalRate = systemRate + (systemRate * resellerRate) / 100;
      resellerCommission = ((qty / 1000) * systemRate * resellerRate) / 100;
    }

    if (childPanelOwnerId) {
      const cpOwner = await User.findById(childPanelOwnerId);
      const cpCommissionRate = Number(cpOwner?.childPanelCommissionRate || 0);

      if (cpCommissionRate > 0) {
        const finalCharge = (qty / 1000) * finalRate;
        childPanelCommission = (finalCharge * cpCommissionRate) / 100;
      }
    }
  }

  const finalCharge = (qty / 1000) * finalRate;
  const baseCharge = (qty / 1000) * providerRate;

  return {
    finalCharge,
    baseCharge,
    finalRate,
    resellerCommission,
    childPanelCommission,
  };
};
