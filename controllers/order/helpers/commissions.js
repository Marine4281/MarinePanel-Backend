import Wallet from "../../models/Wallet.js";
import { calculateBalance } from "./wallet.js";

export const creditResellerCommission = async (order) => {
  try {
    if (
      order.status !== "completed" ||
      order.earningsCredited ||
      !order.resellerOwner ||
      order.resellerCommission <= 0
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

export const reverseResellerCommission = async (order) => {
  try {
    if (
      !order.earningsCredited ||
      !order.resellerOwner ||
      order.resellerCommission <= 0
    ) {
      return;
    }

    const wallet = await Wallet.findOne({ user: order.resellerOwner });
    if (!wallet) return;

    wallet.transactions.push({
      type: "Commission Reversal",
      amount: -Number(order.resellerCommission),
      status: "Completed",
      note: `Reversal - #${order.customOrderId}`,
      reference: order._id,
      createdAt: new Date(),
    });

    wallet.balance = calculateBalance(wallet.transactions);
    order.earningsCredited = false;

    await Promise.all([wallet.save(), order.save()]);
  } catch (err) {
    console.error("Commission Reversal Error:", err);
  }
};

export const creditChildPanelCommission = async (order) => {
  try {
    if (
      order.status !== "completed" ||
      order.childPanelEarningsCredited ||
      !order.childPanelOwner ||
      order.childPanelCommission <= 0
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

export const reverseChildPanelCommission = async (order) => {
  try {
    if (
      !order.childPanelEarningsCredited ||
      !order.childPanelOwner ||
      order.childPanelCommission <= 0
    ) {
      return;
    }

    const wallet = await Wallet.findOne({ user: order.childPanelOwner });
    if (!wallet) return;

    wallet.transactions.push({
      type: "CP Commission Reversal",
      amount: -Number(order.childPanelCommission),
      status: "Completed",
      note: `CP Reversal - #${order.customOrderId}`,
      reference: order._id,
      createdAt: new Date(),
    });

    wallet.balance = calculateBalance(wallet.transactions);
    order.childPanelEarningsCredited = false;

    await Promise.all([wallet.save(), order.save()]);
  } catch (err) {
    console.error("Child panel commission reversal error:", err);
  }
};
