// jobs/billingCronJob.js
//
// Runs once daily (at midnight UTC).
// For every active child panel:
//   1. If auto-deduct is ON and billing is due → try to deduct from the user's normal wallet
//   2. If deduction fails (insufficient) → suspend (childPanelIsActive = false + childPanelSubscriptionSuspended = true)
//   3. If billing overdue + grace expired + still insufficient → suspend
//   4. If panel is subscription-suspended but wallet now has enough → auto-reactivate

import cron from "node-cron";
import User from "../models/User.js";
import Wallet from "../models/Wallet.js";
import Settings from "../models/Settings.js";
import { resolveChildPanelFee, tryReactivateChildPanel } from "../utils/childPanelBilling.js";

const calculateBalance = (transactions = []) =>
  transactions
    .filter((t) => t.status === "Completed")
    .reduce((acc, t) => acc + (Number(t.amount) || 0), 0);

// Deducts `fee` from the CP owner's normal wallet via the ledger,
// keeps Wallet.balance and User.balance in sync, returns the new balance.
const deductFeeFromWallet = async (cpId, fee, note) => {
  let wallet = await Wallet.findOne({ user: cpId });
  if (!wallet) {
    wallet = await Wallet.create({ user: cpId, balance: 0, transactions: [] });
  }

  wallet.transactions.push({
    type: "Admin Adjustment",
    amount: -Number(fee),
    status: "Completed",
    note,
    createdAt: new Date(),
  });
  wallet.balance = calculateBalance(wallet.transactions);
  await wallet.save();

  await User.findByIdAndUpdate(cpId, { balance: wallet.balance });

  return wallet.balance;
};

const runBillingCycle = async () => {
  console.log("💳 [BillingCron] Running billing cycle...");

  try {
    const settings = await Settings.findOne().lean();

    // ── Global defaults — explicit fallbacks matching CPFeesTab defaults ──
    const globalGraceHours  = typeof settings?.childPanelGracePeriodHours === "number"
      ? settings.childPanelGracePeriodHours
      : 0;
    const globalAutoDeduct  = typeof settings?.childPanelAutoDeduct === "boolean"
      ? settings.childPanelAutoDeduct
      : true;
    const globalIntervalDays = Number(settings?.childPanelBillingIntervalDays ?? 30);

    const panels = await User.find({
      isChildPanel: true,
      childPanelNextBilledAt: { $ne: null },
    });

    const now = new Date();
    let deducted = 0;
    let suspended = 0;
    let reactivated = 0;

    for (const cp of panels) {
      const nextBilledAt = new Date(cp.childPanelNextBilledAt);

      // ── Resolve effective settings per panel (null = use global) ──
      const effectiveGraceHours = typeof cp.childPanelGracePeriodHours === "number"
        ? cp.childPanelGracePeriodHours
        : globalGraceHours;

      const effectiveAutoDeduct = typeof cp.childPanelAutoDeduct === "boolean"
        ? cp.childPanelAutoDeduct
        : globalAutoDeduct;

      const effectiveIntervalDays = typeof cp.childPanelBillingIntervalDays === "number"
        ? cp.childPanelBillingIntervalDays
        : globalIntervalDays;

      const graceDeadline = new Date(
        nextBilledAt.getTime() + effectiveGraceHours * 60 * 60 * 1000
      );

      const isDue        = now >= nextBilledAt;
      const graceExpired  = now >= graceDeadline;

      const fee = resolveChildPanelFee(cp, settings);

      // Current wallet balance for this CP owner
      const wallet = await Wallet.findOne({ user: cp._id }).lean();
      const currentBalance = wallet ? calculateBalance(wallet.transactions) : 0;

      // ── Step 1: Auto-deduct when due ─────────────────────────────────
      if (isDue && effectiveAutoDeduct && !cp.childPanelSubscriptionSuspended) {
        if (fee > 0 && currentBalance >= fee) {
          await deductFeeFromWallet(
            cp._id,
            fee,
            `Child panel subscription fee — auto-billed`
          );

          cp.childPanelLastBilledAt          = now;
          cp.childPanelNextBilledAt          = new Date(now.getTime() + effectiveIntervalDays * 24 * 60 * 60 * 1000);
          cp.childPanelOrdersThisCycle       = 0;
          cp.childPanelSubscriptionSuspended = false;
          cp.childPanelIsActive              = true;
          cp.childPanelSuspendReason         = null;

          await cp.save();
          deducted++;
          console.log(`✅ [BillingCron] Deducted $${fee} from CP ${cp._id} (${cp.email})`);
          continue;
        }

        // Wallet insufficient — suspend only when grace expires
        if (graceExpired) {
          cp.childPanelSubscriptionSuspended = true;
          cp.childPanelIsActive              = false;
          cp.childPanelSuspendReason         = `Subscription fee unpaid — wallet insufficient ($${currentBalance.toFixed(2)} of $${fee} required). Please top up your wallet to reactivate.`;
          await cp.save();
          suspended++;
          console.log(`🚫 [BillingCron] Suspended CP ${cp._id} (${cp.email}) — insufficient wallet after ${effectiveGraceHours}h grace`);
          continue;
        }

        // Still within grace — log and skip
        console.log(`⏳ [BillingCron] CP ${cp._id} in grace period (${effectiveGraceHours}h). Grace deadline: ${graceDeadline.toISOString()}`);
        continue;
      }

      // ── Step 2: Suspend if grace expired (non-auto-deduct panels) ────
      if (isDue && graceExpired && !effectiveAutoDeduct && !cp.childPanelSubscriptionSuspended) {
        cp.childPanelSubscriptionSuspended = true;
        cp.childPanelIsActive              = false;
        cp.childPanelSuspendReason         = "Subscription fee unpaid — panel suspended. Please pay your subscription fee to reactivate.";
        await cp.save();
        suspended++;
        console.log(`🚫 [BillingCron] Suspended CP ${cp._id} (${cp.email}) — grace expired (manual pay mode)`);
        continue;
      }

      // ── Step 3: Auto-reactivate suspended panels with sufficient wallet ──
      if (cp.childPanelSubscriptionSuspended) {
        const { reactivated: wasReactivated } = await tryReactivateChildPanel(cp, settings);
        if (wasReactivated) {
          reactivated++;
          console.log(`✅ [BillingCron] Auto-reactivated CP ${cp._id} (${cp.email}) — wallet sufficient`);
        }
      }
    }

    console.log(
      `💳 [BillingCron] Done — ${deducted} deducted, ${suspended} suspended, ${reactivated} auto-reactivated`
    );
  } catch (err) {
    console.error("❌ [BillingCron] Error:", err);
  }
};

export const startBillingCronJob = () => {
  console.log("⏱️ Billing cron started");
  cron.schedule("5 0 * * *", runBillingCycle);
};
