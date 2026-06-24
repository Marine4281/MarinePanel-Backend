// jobs/billingCronJob.js
//
// Runs once daily (at midnight UTC).
// For every active child panel:
//   1. If auto-deduct is ON and billing is due → try to deduct wallet
//   2. If deduction fails (insufficient) → suspend (childPanelIsActive = false + childPanelSubscriptionSuspended = true)
//   3. If billing overdue + grace expired + still insufficient → suspend
//   4. If panel is subscription-suspended but wallet now has enough → auto-reactivate

import cron from "node-cron";
import User from "../models/User.js";
import Settings from "../models/Settings.js";

const runBillingCycle = async () => {
  console.log("💳 [BillingCron] Running billing cycle...");

  try {
    const settings = await Settings.findOne().lean();
    const globalGraceHours = settings?.childPanelGracePeriodHours ?? 0;
    const globalAutoDeduct = settings?.childPanelAutoDeduct ?? true;

    // Process all panels that have a next billing date
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

      // Resolve effective settings (per-CP override → global)
      const effectiveGraceHours = cp.childPanelGracePeriodHours ?? globalGraceHours;
      const effectiveAutoDeduct = cp.childPanelAutoDeduct ?? globalAutoDeduct;
      const effectiveIntervalDays =
        cp.childPanelBillingIntervalDays ??
        Number(settings?.childPanelBillingIntervalDays ?? 30);

      const graceDeadline = new Date(
        nextBilledAt.getTime() + effectiveGraceHours * 60 * 60 * 1000
      );

      const isDue        = now >= nextBilledAt;
      const graceExpired = now >= graceDeadline;

      // ── Resolve fee ──────────────────────────────────────────────────
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

      // ── Step 1: Auto-deduct when due ─────────────────────────────────
      if (isDue && effectiveAutoDeduct && !cp.childPanelSubscriptionSuspended) {
        if (fee > 0 && cp.childPanelWallet >= fee) {
          cp.childPanelWallet            = parseFloat((cp.childPanelWallet - fee).toFixed(2));
          cp.childPanelLastBilledAt      = now;
          cp.childPanelNextBilledAt      = new Date(now.getTime() + effectiveIntervalDays * 24 * 60 * 60 * 1000);
          cp.childPanelOrdersThisCycle   = 0;
          cp.childPanelSubscriptionSuspended = false;
          cp.childPanelIsActive          = true; // ensure active
          cp.childPanelSuspendReason     = null;

          await cp.save();
          deducted++;
          console.log(`✅ [BillingCron] Deducted $${fee} from CP ${cp._id} (${cp.email})`);
          continue;
        }

        // Wallet insufficient — suspend immediately when grace expires
        if (graceExpired) {
          cp.childPanelSubscriptionSuspended = true;
          cp.childPanelIsActive          = false; // ← KEY: reflect in admin dashboard
          cp.childPanelSuspendReason     = "Subscription fee unpaid — wallet insufficient. Please top up your wallet to reactivate.";
          await cp.save();
          suspended++;
          console.log(`🚫 [BillingCron] Suspended CP ${cp._id} (${cp.email}) — insufficient wallet after grace`);
          continue;
        }
      }

      // ── Step 2: Suspend if grace expired (non-auto-deduct panels) ────
      if (isDue && graceExpired && !cp.childPanelSubscriptionSuspended) {
        cp.childPanelSubscriptionSuspended = true;
        cp.childPanelIsActive          = false; // ← KEY
        cp.childPanelSuspendReason     = "Subscription fee unpaid — panel suspended. Please pay your subscription fee to reactivate.";
        await cp.save();
        suspended++;
        console.log(`🚫 [BillingCron] Suspended CP ${cp._id} (${cp.email}) — grace expired`);
        continue;
      }

      // ── Step 3: Auto-reactivate suspended panels with sufficient wallet ──
      // This handles the case where admin topped up the wallet between cron runs
      if (cp.childPanelSubscriptionSuspended && fee > 0 && cp.childPanelWallet >= fee) {
        cp.childPanelWallet            = parseFloat((cp.childPanelWallet - fee).toFixed(2));
        cp.childPanelLastBilledAt      = now;
        cp.childPanelNextBilledAt      = new Date(now.getTime() + effectiveIntervalDays * 24 * 60 * 60 * 1000);
        cp.childPanelOrdersThisCycle   = 0;
        cp.childPanelSubscriptionSuspended = false;
        cp.childPanelIsActive          = true;  // ← reactivate
        cp.childPanelSuspendReason     = null;

        await cp.save();
        reactivated++;
        console.log(`✅ [BillingCron] Auto-reactivated CP ${cp._id} (${cp.email}) — wallet sufficient`);
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
