// utils/onCpWalletCredited.js
//
// Single entry point for "a CP owner's wallet balance just went up."
// Runs every resume/reactivation check that depends on wallet balance:
//   1. Subscription reactivation (if panel is suspended for unpaid billing)
//   2. Reseller activation resume (if any resellers are on hold for unpaid platform fee)
//
// Call this anywhere a CP owner's Wallet.balance is credited —
// admin top-up, gateway deposit, reseller deposit-earning, etc.
// `cpOwner` must be a full Mongoose User document (not .lean()).

import Settings from "../models/Settings.js";
import { tryReactivateChildPanel } from "./childPanelBilling.js";
import { resolvePendingActivationsForCp } from "../controllers/resellerActivationResolver.js";

export const onCpWalletCredited = async (cpOwner, io) => {
  const settings = await Settings.findOne().lean();

  const { reactivated, newBalance } = await tryReactivateChildPanel(cpOwner, settings);
  const resumedResellers = await resolvePendingActivationsForCp(cpOwner._id, io);

  return { reactivated, newBalance, resumedResellers };
};
