// jobs/resellerActivationSyncJob.js
import cron from "node-cron";
import { resolveAllPendingActivations } from "../controllers/resellerActivationResolver.js";

export const startResellerActivationSyncJob = (io) => {
  console.log("⏱️ Reseller activation sync cron started");
  cron.schedule("*/2 * * * *", async () => {
    try {
      await resolveAllPendingActivations(io);
    } catch (err) {
      console.error("Reseller activation sync error:", err.message);
    }
  });
};
