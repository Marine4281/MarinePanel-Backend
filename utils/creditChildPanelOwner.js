// utils/creditChildPanelOwner.js
//
// Single source of truth for "an end user under a CP just deposited —
// credit the CP owner's wallet too." Used by both the generic gateway
// deposit flow (depositController.js) and the legacy platform Paystack
// flow (paymentController.js) so the rule can't drift between them.
//
// Credits even if the CP panel is currently suspended (childPanelIsActive
// === false) or subscription-suspended — suspension shouldn't block a CP
// owner from receiving earnings, since receiving funds is exactly what
// lets them pay off an overdue fee and get reactivated.

import User from "../models/User.js";
import Wallet from "../models/Wallet.js";
import { calcBalance } from "./gatewayHelpers.js";
import { onCpWalletCredited } from "./onCpWalletCredited.js";

export const creditChildPanelOwner = async (transaction, io, noteSuffix = "") => {
  if (!transaction.childPanelOwner || transaction.childPanelCredited) return;

  const cpOwner = await User.findById(transaction.childPanelOwner);
  if (!cpOwner || !cpOwner.isChildPanel) return;

  let cpWallet = await Wallet.findOne({ user: cpOwner._id });
  if (!cpWallet) {
    cpWallet = await Wallet.create({ user: cpOwner._id, balance: 0, transactions: [] });
  }

  cpWallet.transactions.push({
    type: "CP Deposit Earning",
    amount: transaction.amount,
    status: "Completed",
    reference: `CP-${transaction.reference}`,
    note: `User deposit${noteSuffix}`,
    createdAt: new Date(),
  });

  cpWallet.balance = calcBalance(cpWallet.transactions);
  await cpWallet.save();
  await User.findByIdAndUpdate(cpOwner._id, { balance: cpWallet.balance });

  transaction.childPanelCredited = true;
  await transaction.save();

  if (io) {
    io.emit("wallet:update", { userId: cpOwner._id, balance: cpWallet.balance });
  }

  // Check whether this credit reactivates a suspended panel and/or
  // resumes any resellers on hold for the platform fee.
  const { reactivated } = await onCpWalletCredited(cpOwner, io);
  if (reactivated && io) {
    io.to(String(cpOwner._id)).emit("childPanelReactivated", {
      message: "Your child panel subscription has been paid and reactivated.",
    });
  }
};
