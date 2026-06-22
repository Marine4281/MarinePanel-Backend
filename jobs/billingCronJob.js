// jobs/billingCronJob.js
//
// Runs once daily (at midnight UTC).
// For every active child panel:
//   1. If auto-deduct is ON and billing is due → try to deduct wallet
//   2. If billing overdue + grace expired → set childPanelSubscriptionSuspended = true
//   3. If billing not yet due but reminder window active → nothing (frontend reads it)

import cron from "node-cron";
import User from "../models/User.js";
import Settings from "../models/Settings.js";

const runBillingCycle = async () => {
  console.log("💳 [BillingCron] Running billing cycle...");

  try {
    const settings = await Settings.findOne().lean();
    const globalGraceHours    = settings?.childPanelGracePeriodHours ?? 0;
    const globalAutoDeduct    = settings?.childPanelAutoDeduct ?? true;

    // Only process panels that have a next billing date set
    const panels = await User.find({
      isChildPanel: true,
      childPanelNextBilledAt: { $ne: null },
    });

    const now = new Date();
    let deducted = 0;
    let suspended = 0;

    for (const cp of panels) {
      const nextBilledAt = new Date(cp.childPanelNextBilledAt);

      // Resolve effective settings (per-CP override → global)
      const effectiveGraceHours = cp.childPanelGracePeriodHours ?? globalGraceHours;
      const effectiveAutoDeduct = cp.childPanelAutoDeduct ?? globalAutoDeduct;

      // Grace deadline = due date + grace hours
      const graceDeadline = new Date(
        nextBilledAt.getTime() + effectiveGraceHours * 60 * 60 * 1000
      );

      const isDue         = now >= nextBilledAt;
      const graceExpired  = now >= graceDeadline;

      // ── Step 1: Auto-deduct ──────────────────────────────────────────
      if (isDue && effectiveAutoDeduct && !cp.childPanelSubscriptionSuspended) {
        // Resolve effective fee
        const effectiveIntervalDays =
          cp.childPanelBillingIntervalDays ??
          Number(settings?.childPanelBillingIntervalDays ?? 30);

        let fee = 0;
        const billingMode = cp.childPanelBillingMode || "monthly";

        if (billingMode === "monthly" || billingMode === "both") {
          // Check for tiered billing
          const tiers = settings?.childPanelMonthlyTiers ?? [];
          const orders = cp.childPanelOrdersThisCycle ?? 0;

          if (tiers.length > 0) {
            const tier = tiers.find(
              (t) =>
                orders >= t.minOrders &&
                (t.maxOrders === null || orders <= t.maxOrders)
            );
            fee += tier ? tier.fee : (cp.childPanelMonthlyFee ?? settings?.childPanelMonthlyFee ?? 20);
          } else {
            fee += cp.childPanelMonthlyFee ?? settings?.childPanelMonthlyFee ?? 20;
          }
        }

        if (billingMode === "per_order" || billingMode === "both") {
          const perOrderFee = cp.childPanelPerOrderFee ?? settings?.childPanelPerOrderFee ?? 0;
          fee += perOrderFee * (cp.childPanelOrdersThisCycle ?? 0);
        }

        if (fee > 0 && cp.childPanelWallet >= fee) {
          // Deduct wallet
          cp.childPanelWallet = parseFloat((cp.childPanelWallet - fee).toFixed(2));

          // Advance billing clock
          cp.childPanelLastBilledAt = now;
          cp.childPanelNextBilledAt = new Date(
            now.getTime() + effectiveIntervalDays * 24 * 60 * 60 * 1000
          );
          cp.childPanelOrdersThisCycle = 0;
          cp.childPanelSubscriptionSuspended = false; // clear if was suspended

          await cp.save();
          deducted++;
          console.log(`✅ [BillingCron] Deducted $${fee} from CP ${cp._id} (${cp.email})`);
          continue; // skip suspension check for this panel
        }
      }

      // ── Step 2: Suspend if grace expired ────────────────────────────
      if (isDue && graceExpired && !cp.childPanelSubscriptionSuspended) {
        cp.childPanelSubscriptionSuspended = true;
        await cp.save();
        suspended++;
        console.log(`🚫 [BillingCron] Suspended CP ${cp._id} (${cp.email}) — grace expired`);
      }

      // ── Step 3: Lift suspension if wallet was topped up ─────────────
      // (handled separately via a manual "pay now" endpoint — see below)
    }

    console.log(
      `💳 [BillingCron] Done — ${deducted} deducted, ${suspended} suspended`
    );
  } catch (err) {
    console.error("❌ [BillingCron] Error:", err);
  }
};

export const startBillingCronJob = () => {
  console.log("⏱️ Billing cron started");
  // Run once daily at 00:05 UTC
  cron.schedule("5 0 * * *", runBillingCycle);
};
