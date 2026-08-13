import Wallet from "../../../models/Wallet.js";
import Settings from "../../../models/Settings.js";
import { calculateBalance } from "./wallet.js";

const round4 = (n) => Number((Number(n) || 0).toFixed(4));
const clampRatio = (r) => Math.min(1, Math.max(0, Number(r) || 0));

/* ============================================================
   RESELLER COMMISSION
   Credited the instant the order is created — not gated on
   order.status. Idempotent via order.earningsCredited.
============================================================ */
export const creditResellerCommission = async (order) => {
  try {
    if (
      order.earningsCredited ||
      !order.resellerOwner ||
      !(Number(order.resellerCommission) > 0)
    ) {
      return;
    }

    const wallet = await Wallet.findOne({ user: order.resellerOwner });
    if (!wallet) return;

    wallet.transactions.push({
      type: "Commission",
      amount: Number(order.resellerCommission),
      status: "Completed",
      note: `Commission - #${order.customOrderId}`,
      reference: order._id,
      createdAt: new Date(),
    });

    wallet.balance = calculateBalance(wallet.transactions);
    order.earningsCredited = true;

    await Promise.all([wallet.save(), order.save()]);
  } catch (error) {
    console.error("Commission error:", error);
  }
};

/* ============================================================
   RESELLER COMMISSION REVERSAL
   ratio: 1 = full reversal (failed order / full refund)
          0-1 = proportional reversal (partial delivery refund)
   Tracks resellerCommissionReversedAmount so a partial reversal
   followed later by a bigger one only takes the remaining delta.
============================================================ */
export const reverseResellerCommission = async (order, ratio = 1) => {
  try {
    if (
      !order.earningsCredited ||
      !order.resellerOwner ||
      !(Number(order.resellerCommission) > 0)
    ) {
      return;
    }

    const total = Number(order.resellerCommission);
    const alreadyReversed = Number(order.resellerCommissionReversedAmount || 0);
    const targetReversed = round4(total * clampRatio(ratio));
    const delta = round4(targetReversed - alreadyReversed);

    if (delta <= 0) return;

    const wallet = await Wallet.findOne({ user: order.resellerOwner });
    if (!wallet) return;

    wallet.transactions.push({
      type: "Commission Reversal",
      amount: -delta,
      status: "Completed",
      note: `Reversal - #${order.customOrderId}`,
      reference: order._id,
      createdAt: new Date(),
    });

    wallet.balance = calculateBalance(wallet.transactions);
    order.resellerCommissionReversedAmount = targetReversed;
    if (targetReversed >= total - 0.0001) {
      order.earningsCredited = false;
    }

    await Promise.all([wallet.save(), order.save()]);
  } catch (err) {
    console.error("Commission Reversal Error:", err);
  }
};

/* ============================================================
   CHILD PANEL COMMISSION
   Same instant-credit model as reseller commission.
============================================================ */
export const creditChildPanelCommission = async (order) => {
  try {
    if (
      order.childPanelEarningsCredited ||
      !order.childPanelOwner ||
      !(Number(order.childPanelCommission) > 0)
    ) {
      return;
    }

    const wallet = await Wallet.findOne({ user: order.childPanelOwner });
    if (!wallet) return;

    wallet.transactions.push({
      type: "CP Commission",
      amount: Number(order.childPanelCommission),
      status: "Completed",
      note: `CP Commission - #${order.customOrderId}`,
      reference: order._id,
      createdAt: new Date(),
    });

    wallet.balance = calculateBalance(wallet.transactions);
    order.childPanelEarningsCredited = true;

    await Promise.all([wallet.save(), order.save()]);
  } catch (error) {
    console.error("Child panel commission error:", error);
  }
};

/* ============================================================
   CHILD PANEL COMMISSION REVERSAL (proportional, delta-tracked)
============================================================ */
export const reverseChildPanelCommission = async (order, ratio = 1) => {
  try {
    if (
      !order.childPanelEarningsCredited ||
      !order.childPanelOwner ||
      !(Number(order.childPanelCommission) > 0)
    ) {
      return;
    }

    const total = Number(order.childPanelCommission);
    const alreadyReversed = Number(order.childPanelCommissionReversedAmount || 0);
    const targetReversed = round4(total * clampRatio(ratio));
    const delta = round4(targetReversed - alreadyReversed);

    if (delta <= 0) return;

    const wallet = await Wallet.findOne({ user: order.childPanelOwner });
    if (!wallet) return;

    wallet.transactions.push({
      type: "CP Commission Reversal",
      amount: -delta,
      status: "Completed",
      note: `CP Reversal - #${order.customOrderId}`,
      reference: order._id,
      createdAt: new Date(),
    });

    wallet.balance = calculateBalance(wallet.transactions);
    order.childPanelCommissionReversedAmount = targetReversed;
    if (targetReversed >= total - 0.0001) {
      order.childPanelEarningsCredited = false;
    }

    await Promise.all([wallet.save(), order.save()]);
  } catch (err) {
    console.error("Child panel commission reversal error:", err);
  }
};

/* ============================================================
   ADMIN / PLATFORM REVENUE
   Frozen amount = order.adminProfit (finalCharge - baseCharge,
   snapshotted at order creation). Credited instantly, reversed
   proportionally on failure/partial/refund.
============================================================ */
export const creditAdminRevenue = async (order) => {
  try {
    if (order.adminRevenueCredited || !(Number(order.adminProfit) !== 0)) {
      return;
    }

    const settings = await Settings.findOne();
    if (!settings) return;

    settings.totalRevenue = round4(
      Number(settings.totalRevenue || 0) + Number(order.adminProfit)
    );
    order.adminRevenueCredited = true;

    await Promise.all([settings.save(), order.save()]);
  } catch (error) {
    console.error("Admin revenue credit error:", error);
  }
};

export const reverseAdminRevenue = async (order, ratio = 1) => {
  try {
    if (!order.adminRevenueCredited || !(Number(order.adminProfit) !== 0)) {
      return;
    }

    const total = Number(order.adminProfit);
    const alreadyReversed = Number(order.adminRevenueReversedAmount || 0);
    const targetReversed = round4(total * clampRatio(ratio));
    const delta = round4(targetReversed - alreadyReversed);

    if (delta === 0) return;

    const settings = await Settings.findOne();
    if (!settings) return;

    settings.totalRevenue = round4(Number(settings.totalRevenue || 0) - delta);
    order.adminRevenueReversedAmount = targetReversed;
    if (Math.abs(targetReversed) >= Math.abs(total) - 0.0001) {
      order.adminRevenueCredited = false;
    }

    await Promise.all([settings.save(), order.save()]);
  } catch (err) {
    console.error("Admin revenue reversal error:", err);
  }
};
