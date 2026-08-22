import Wallet from "../../../models/Wallet.js";
import { calculateBalance, updateUserBalance } from "../../order/helpers/wallet.js";
import {
  reverseResellerCommission,
  reverseChildPanelCommission,
  reverseAdminRevenue,
} from "../../orderController.js";

/* =========================================================
   🔧 REFUND + REVERSE ON SUCCESSFUL CANCEL
   Refunds the end-user, the CP owner, and the reseller owner
   proportionally for whatever wasn't delivered, and reverses
   reseller/CP/admin commission by the same ratio.
========================================================= */
export const processCancelRefund = async (order) => {
  if (order.isFreeOrder || !order.isCharged || order.refundProcessed) {
    return null;
  }

  const quantity = Number(order.quantity || 0);
  const delivered = Number(order.quantityDelivered || 0);
  const remaining = quantity - delivered;

  if (remaining <= 0) {
    order.refundProcessed = true;
    await order.save();
    return null;
  }

  const payerId = order.endUserId || order.userId;
  if (!payerId) return null;

  const wallet = await Wallet.findOne({ user: payerId });
  if (!wallet) return null;

  const alreadyRefunded = wallet.transactions.some(
    (t) => t.type === "Refund" && t.reference?.toString() === order._id.toString()
  );
  if (alreadyRefunded) {
    order.refundProcessed = true;
    await order.save();
    return null;
  }

  const charge = Number(order.charge || 0);
  const ratio = quantity > 0 ? remaining / quantity : 0;
  const refundAmount = Number((ratio * charge).toFixed(4));

  if (refundAmount > 0) {
    wallet.transactions.push({
      type: "Refund",
      amount: refundAmount,
      status: "Completed",
      note: `Refund - Cancelled order #${order.customOrderId} (${remaining} undelivered)`,
      reference: order._id,
      createdAt: new Date(),
    });
    wallet.balance = calculateBalance(wallet.transactions);
    await wallet.save();
    await updateUserBalance(payerId, wallet);
  }

  // ─── REFUND CP OWNER for the wholesale share of the undelivered qty ──
  const cpOwnerCharge = Number(order.cpOwnerCharge || 0);
  if (order.childPanelOwner && cpOwnerCharge > 0) {
    const cpOwnerRefund = Number((ratio * cpOwnerCharge).toFixed(4));
    if (cpOwnerRefund > 0) {
      const cpOwnerWallet = await Wallet.findOne({ user: order.childPanelOwner });
      if (cpOwnerWallet) {
        cpOwnerWallet.transactions.push({
          type: "Refund",
          amount: cpOwnerRefund,
          status: "Completed",
          note: `Refund - Cancelled order #${order.customOrderId} (${remaining} undelivered)`,
          reference: order._id,
          createdAt: new Date(),
        });
        cpOwnerWallet.balance = calculateBalance(cpOwnerWallet.transactions);
        await cpOwnerWallet.save();
        await updateUserBalance(order.childPanelOwner, cpOwnerWallet);
      }
    }
  }

  // ─── REFUND RESELLER OWNER for the wholesale share of the undelivered qty ─
  const resellerOwnerCharge = Number(order.resellerOwnerCharge || 0);
  if (order.resellerOwner && resellerOwnerCharge > 0) {
    const resellerOwnerRefund = Number((ratio * resellerOwnerCharge).toFixed(4));
    if (resellerOwnerRefund > 0) {
      const resellerOwnerWallet = await Wallet.findOne({ user: order.resellerOwner });
      if (resellerOwnerWallet) {
        resellerOwnerWallet.transactions.push({
          type: "Refund",
          amount: resellerOwnerRefund,
          status: "Completed",
          note: `Refund - Cancelled order #${order.customOrderId} (${remaining} undelivered)`,
          reference: order._id,
          createdAt: new Date(),
        });
        resellerOwnerWallet.balance = calculateBalance(resellerOwnerWallet.transactions);
        await resellerOwnerWallet.save();
        await updateUserBalance(order.resellerOwner, resellerOwnerWallet);
      }
    }
  }

  order.refundProcessed = true;
  await order.save();

  await reverseResellerCommission(order, ratio);
  await reverseChildPanelCommission(order, ratio);
  await reverseAdminRevenue(order, ratio);

  return { refundAmount };
};

/* =========================================================
   🔧 Extract this order's cancel result out of a provider's
   batch-cancel response, whatever shape it comes back in.
========================================================= */
export const extractCancelResult = (response, providerOrderId) => {
  if (Array.isArray(response)) {
    const match = response.find(
      (r) => String(r?.order) === String(providerOrderId)
    );
    if (!match) return null;
    return typeof match.cancel === "object" ? null : match.cancel;
  }

  if (response && typeof response === "object") {
    if (Object.prototype.hasOwnProperty.call(response, providerOrderId)) {
      const val = response[providerOrderId];
      return typeof val === "object" ? (val?.cancel ?? null) : val;
    }
    if ("cancel" in response) {
      return typeof response.cancel === "object" ? null : response.cancel;
    }
  }

  return null;
};
