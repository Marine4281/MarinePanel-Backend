import Settings from "../../models/Settings.js";
import User from "../../models/User.js";

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
    const cpOwner = childPanelOwnerId
      ? await User.findById(childPanelOwnerId)
      : null;

    const cpCommissionRate = Number(
      cpOwner?.childPanelCommissionRate || 0
    );

    finalRate =
      providerRate +
      (providerRate * cpCommissionRate) / 100;

    if (cpOwner && cpCommissionRate > 0) {
      childPanelCommission =
        (qty / 1000) * (finalRate - providerRate);
    }
  } else {
    const settings = await Settings.findOne().lean();

    const globalRate = Number(settings?.commission || 0);

    const adminRate =
      user.commissionOverride != null
        ? Number(user.commissionOverride)
        : globalRate;

    const systemRate =
      providerRate +
      (providerRate * adminRate) / 100;

    finalRate = systemRate;

    if (user.resellerOwner) {
      const reseller = await User.findById(user.resellerOwner);

      const resellerRate = Number(
        reseller?.resellerCommissionRate || 0
      );

      finalRate =
        systemRate +
        (systemRate * resellerRate) / 100;

      resellerCommission =
        ((qty / 1000) * systemRate * resellerRate) / 100;
    }

    if (childPanelOwnerId) {
      const cpOwner = await User.findById(childPanelOwnerId);

      const cpCommissionRate = Number(
        cpOwner?.childPanelCommissionRate || 0
      );

      if (cpCommissionRate > 0) {
        const finalCharge =
          (qty / 1000) * finalRate;

        childPanelCommission =
          (finalCharge * cpCommissionRate) / 100;
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
