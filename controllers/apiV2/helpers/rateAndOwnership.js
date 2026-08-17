import User from "../../../models/User.js";
import Settings from "../../../models/Settings.js";

export const resolveRateAndOwnership = async (user, selectedService, qty) => {
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
