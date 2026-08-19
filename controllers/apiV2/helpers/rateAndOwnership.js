import User from "../../../models/User.js";
import Settings from "../../../models/Settings.js";

export const resolveRateAndOwnership = async (user, selectedService, qty) => {
  const providerRate = Number(selectedService.rate || 0);

  // Raw cost basis — what fulfilling this order actually costs (used for
  // CP-owner wallet deduction and to compute adminProfit).
  const baseCharge = Number(((qty / 1000) * providerRate).toFixed(4));

  let baseRate; // rate before any reseller markup
  let childPanelOwnerId = null;
  let childPanelCommission = 0;
  let childPanelPerOrderFee = 0;

  if (selectedService.cpOwner) {
    // ── CP-owned service: no admin/platform commission layer ──────────
    if (user.isChildPanel) {
      // CP owner ordering directly, on their own key, from their own
      // catalog — no downstream party to mark up for, so they pay cost.
      baseRate = providerRate;
    } else {
      const cpOwner = await User.findById(selectedService.cpOwner);
      const cpCommissionRate = Number(cpOwner?.childPanelCommissionRate || 0);
      baseRate = providerRate + (providerRate * cpCommissionRate) / 100;

      if (cpOwner && cpOwner.isChildPanel && cpOwner.childPanelIsActive) {
        childPanelOwnerId = cpOwner._id;
        childPanelPerOrderFee = Number(cpOwner.childPanelPerOrderFee || 0);
        if (cpCommissionRate > 0) {
          childPanelCommission = Number(
            (((qty / 1000) * (baseRate - providerRate))).toFixed(4)
          );
        }
      }
    }
  } else {
    // ── Main platform service: admin commission, then CP markup on top ─
    const settings = await Settings.findOne().lean();
    const adminRate = Number(settings?.commission || 0);
    const adminFinalRate = providerRate + (providerRate * adminRate) / 100;
    baseRate = adminFinalRate;

    // CP owners placing orders themselves are NOT end-users of any panel
    if (user.childPanelOwner && !user.isChildPanel) {
      const cpOwner = await User.findById(user.childPanelOwner);
      if (cpOwner && cpOwner.isChildPanel && cpOwner.childPanelIsActive) {
        childPanelOwnerId = cpOwner._id;
        childPanelPerOrderFee = Number(cpOwner.childPanelPerOrderFee || 0);
        const cpCommissionRate = Number(cpOwner.childPanelCommissionRate || 0);
        if (cpCommissionRate > 0) {
          baseRate = adminFinalRate + (adminFinalRate * cpCommissionRate) / 100;
          childPanelCommission = Number(
            (((qty / 1000) * (baseRate - adminFinalRate))).toFixed(4)
          );
        }
      }
    }
  }

  let finalRate = baseRate;
  let resellerCommission = 0;
  let resellerOwnerId = null;

  if (user.resellerOwner) {
    const reseller = await User.findById(user.resellerOwner);
    const resellerRate = Number(reseller?.resellerCommissionRate || 0);

    if (resellerRate > 0) {
      finalRate = baseRate + (baseRate * resellerRate) / 100;
      resellerCommission = Number(
        (((qty / 1000) * (finalRate - baseRate))).toFixed(4)
      );
    }

    resellerOwnerId = user.resellerOwner;
  }

  const finalCharge = Number(((qty / 1000) * finalRate).toFixed(4));

  return {
    providerRate,
    systemRate: baseRate,
    finalRate,
    finalCharge,
    baseCharge,
    resellerOwnerId,
    resellerCommission,
    childPanelOwnerId,
    childPanelCommission,
    childPanelPerOrderFee,
  };
};
