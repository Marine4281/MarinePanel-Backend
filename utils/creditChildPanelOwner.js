// utils/creditChildPanelOwner.js
//
// Single source of truth for "an end user under a CP just deposited —
// should the CP owner's wallet be credited too?"
//
// Decided by the gateway that was actually used, not a user-level
// setting — a CP can have both their own gateways and platform-
// connected ones at the same time:
//
//   gw.isPlatformConnected === true  → the deposit rode on the
//     platform's own processor/credentials, so the platform is really
//     the one holding the money. Credit the CP owner's wallet to
//     reflect what's owed to them, in lockstep with the end user.
//
//   gw.isPlatformConnected === false → CP's own gateway/manual
//     instructions. The CP already collects those funds directly
//     (their own provider account, or funds sent straight to them for
//     manual/binance) — crediting their platform wallet too would
//     double-count money they already have. Only the end user's
//     wallet gets credited.
//
// Credits even if the CP panel is currently suspended — suspension
// shouldn't block a CP owner from receiving earnings that let them
// pay off an overdue fee and get reactivated.

import User from "../models/User.js";
import Wallet from "../models/Wallet.js";
import { calcBalance } from "./gatewayHelpers.js";
import { onCpWalletCredited } from "./onCpWalletCredited.js";

export const creditChildPanelOwner = async (transaction, gw, io, noteSuffix = "") => {
  if (!transaction.childPanelOwner || transaction.childPanelCredited) return;
  if (!gw?.isPlatformConnected) return; // CP's own gateway — nothing to do here

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

  const { reactivated } = await onCpWalletCredited(cpOwner, io);
  if (reactivated && io) {
    io.to(String(cpOwner._id)).emit("childPanelReactivated", {
      message: "Your child panel subscription has been paid and reactivated.",
    });
  }
};
