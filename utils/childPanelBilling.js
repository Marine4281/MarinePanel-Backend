// utils/childPanelBilling.js
//
// Shared helpers for child panel subscription billing.
// Used anywhere a child panel owner's wallet balance increases —
// admin top-up, manual fee payment, or automatic deposit — to check
// whether an overdue/suspended subscription can now be paid off.

import Wallet from "../models/Wallet.js";
import User from "../models/User.js";

const calculateBalance = (transactions = []) =>
  transactions
    .filter((t) => t.status === "Completed")
    .reduce((acc, t) => acc + (Number(t.amount) || 0), 0);

// Resolves the subscription fee currently due for a child panel,
// based on its billing mode (monthly / per_order / both) and any
// tiered pricing in Settings.
export const resolveChildPanelFee = (cp, settings) => {
  let fee = 0;
  const billingMode = cp.childPanelBillingMode || "monthly";

  if (billingMode === "monthly" || billingMode === "both") {
    const tiers  = settings?.childPanelMonthlyTiers ?? [];
    const orders = cp.childPanelOrdersThisCycle ?? 0;
    if (tiers.length > 0) {
      const tier = tiers.find(
        (t) => orders >= t.minOrders && (t.maxOrders === null || orders <= t.maxOrders)
      );
      fee += tier ? tier.fee : (cp.childPanelMonthlyFee ?? settings?.childPanelMonthlyFee ?? 20);
    } else {
      fee += cp.childPanelMonthlyFee ?? settings?.childPanelMonthlyFee ?? 20;
    }
  }
  if (billingMode === "per_order" || billingMode === "both") {
    fee += (cp.childPanelPerOrderFee ?? settings?.childPanelPerOrderFee ?? 0) *
           (cp.childPanelOrdersThisCycle ?? 0);
  }

  return fee;
};

// If the given child panel is subscription-suspended (or otherwise
// has billing due) and its wallet now covers the fee, deducts the
// fee and reactivates the panel.
//
// `cp` must be a full Mongoose User document (not .lean()), since
// this saves it. Returns { reactivated: boolean, newBalance: number }.
export const tryReactivateChildPanel = async (cp, settings) => {
  if (!cp.childPanelSubscriptionSuspended) {
    const wallet = await Wallet.findOne({ user: cp._id }).lean();
    return { reactivated: false, newBalance: wallet?.balance || 0 };
  }

  const fee = resolveChildPanelFee(cp, settings);

  let wallet = await Wallet.findOne({ user: cp._id });
  if (!wallet) {
    wallet = await Wallet.create({ user: cp._id, balance: 0, transactions: [] });
  }

  if (!(fee > 0 && wallet.balance >= fee)) {
    return { reactivated: false, newBalance: wallet.balance };
  }

  const effectiveIntervalDays =
    cp.childPanelBillingIntervalDays ??
    Number(settings?.childPanelBillingIntervalDays ?? 30);
  const now = new Date();

  wallet.transactions.push({
    type: "Admin Adjustment",
    amount: -Number(fee),
    status: "Completed",
    note: "Child panel subscription fee — auto-reactivated on wallet credit",
    createdAt: now,
  });
  wallet.balance = calculateBalance(wallet.transactions);
  await wallet.save();
  await User.findByIdAndUpdate(cp._id, { balance: wallet.balance });

  cp.childPanelLastBilledAt          = now;
  cp.childPanelNextBilledAt          = new Date(now.getTime() + effectiveIntervalDays * 24 * 60 * 60 * 1000);
  cp.childPanelOrdersThisCycle       = 0;
  cp.childPanelSubscriptionSuspended = false;
  cp.childPanelIsActive              = true;
  cp.childPanelSuspendReason         = null;
  await cp.save();

  return { reactivated: true, newBalance: wallet.balance };
};
