import cron from "node-cron";
import { syncProviderRefills } from "../services/providerRefillSync.js";

export const startRefillSyncJob = () => {
  console.log("⏱️ Refill sync cron started");

  cron.schedule("*/2 * * * *", async () => {
    console.log("🔄 Running refill sync...");
    await syncProviderRefills();
  });
};
