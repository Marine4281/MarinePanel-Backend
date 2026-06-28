// controllers/resellerActivationResolver.js
//
// Shared logic for charging the PLATFORM's anti-abuse fee to a child panel
// owner's wallet whenever one of their resellers activates. Used both at
// activation time and on retry (wallet top-up hook / cron sweep).

import User from "../models/User.js";
import Wallet from "../models/Wallet.js";
import Settings from "../models/Settings.js";
import ResellerActivationEvent from "../models/ResellerActivationEvent.js";

const calculateBalance = (transactions = []) =>
  transactions.reduce((acc, t) => acc + (Number(t.amount) || 0), 0);

const getPlatformFeeFor = async (cpOwner) => {
  if (cpOwner.platformResellerFeeOverride != null) {
    return Number(cpOwner.platformResellerFeeOverride);
  }
  const settings = await Settings.findOne().lean();
  return Number(settings?.platformResellerActivationFee ?? 5);
};

const logEvent = async ({ cpOwnerId, reseller, type, cpFeeCharged, platformFeeCharged, message, io }) => {
  await ResellerActivationEvent.create({
    childPanelOwner: cpOwnerId,
    reseller: reseller._id,
    resellerEmail: reseller.email,
    type,
    cpFeeCharged: cpFeeCharged || 0,
    platformFeeCharged: platformFeeCharged || 0,
    message,
  });

  // Real-time push so the sidebar badge updates instantly if the CP owner
  // is online; falls back gracefully to polling if they're not connected.
  if (io) {
    io.to(String(cpOwnerId)).emit("reseller_activation_event", { type, message });
  }
};

/*
Attempts to charge the platform's anti-abuse fee to the CP owner's wallet
for ONE reseller's activation.
Returns true  -> charged successfully, reseller is fully active
Returns false -> insufficient funds, reseller stays/becomes pending
*/
export const trySettlePlatformResellerFee = async ({ cpOwnerId, resellerUser, cpFeeCharged = 0, io }) => {
  const cpOwner = await User.findById(cpOwnerId);
  if (!cpOwner) return false;

  const fee = await getPlatformFeeFor(cpOwner);

  if (fee <= 0) {
    if (resellerUser.resellerActivationPending) {
      resellerUser.resellerActivationPending = false;
      resellerUser.resellerActivationPendingSince = null;
      await resellerUser.save();
    }
    await logEvent({
      cpOwnerId, reseller: resellerUser, type: "success",
      cpFeeCharged, platformFeeCharged: 0, io,
      message: `${resellerUser.email} activated their reseller panel.`,
    });
    return true;
  }

  let cpWallet = await Wallet.findOne({ user: cpOwner._id });
  if (!cpWallet) {
    cpWallet = await Wallet.create({ user: cpOwner._id, balance: 0, transactions: [] });
  }

  if (cpWallet.balance < fee) {
    const wasAlreadyPending = resellerUser.resellerActivationPending;
    if (!wasAlreadyPending) {
      resellerUser.resellerActivationPending = true;
      resellerUser.resellerActivationPendingSince = new Date();
      await resellerUser.save();

      await logEvent({
        cpOwnerId, reseller: resellerUser, type: "pending",
        cpFeeCharged, platformFeeCharged: 0, io,
        message: `${resellerUser.email}'s reseller panel is paused — top up your wallet to finish activating it.`,
      });
    }
    return false;
  }

  cpWallet.transactions.push({
    type: "Platform Reseller Fee",
    amount: -Number(fee),
    status: "Completed",
    note: `Platform fee — reseller activation (${resellerUser.email})`,
    reference: `PRF-${resellerUser._id}`,
    createdAt: new Date(),
  });
  cpWallet.balance = calculateBalance(cpWallet.transactions);
  await cpWallet.save();

  await User.findByIdAndUpdate(cpOwner._id, {
    balance: cpWallet.balance,
  });

  const wasResumed = resellerUser.resellerActivationPending;

  resellerUser.resellerActivationPending = false;
  resellerUser.resellerActivationPendingSince = null;
  await resellerUser.save();

  if (io) {
    io.emit("walletUpdated", { userId: cpOwner._id, balance: cpWallet.balance });
  }

  await logEvent({
    cpOwnerId, reseller: resellerUser,
    type: wasResumed ? "resumed" : "success",
    cpFeeCharged, platformFeeCharged: fee, io,
    message: wasResumed
      ? `${resellerUser.email}'s reseller panel is now fully active — pending fee was deducted.`
      : `${resellerUser.email} activated their reseller panel. $${fee} fee deducted from your wallet.`,
  });

  return true;
};

/*
Sweeps ALL pending reseller activations for a single CP owner.
Call this right after the CP owner's wallet is topped up.
*/
export const resolvePendingActivationsForCp = async (cpOwnerId, io) => {
  const pendingResellers = await User.find({
    childPanelOwner: cpOwnerId,
    isReseller: true,
    resellerActivationPending: true,
  });

  const resolved = [];
  for (const reseller of pendingResellers) {
    const settled = await trySettlePlatformResellerFee({ cpOwnerId, resellerUser: reseller, io });
    if (settled) resolved.push(reseller);
    else break; // wallet ran out again — remaining stay pending until next top-up/cron pass
  }
  return resolved;
};

/*
Cron-friendly sweep across EVERY CP owner with at least one pending
reseller activation. Mirrors orderSyncJob.js's pattern.
*/
export const resolveAllPendingActivations = async (io) => {
  const cpOwnerIds = await User.distinct("childPanelOwner", {
    isReseller: true,
    resellerActivationPending: true,
  });

  for (const cpOwnerId of cpOwnerIds) {
    try {
      await resolvePendingActivationsForCp(cpOwnerId, io);
    } catch (err) {
      console.error("resolveAllPendingActivations error for CP", cpOwnerId, err.message);
    }
  }
};
