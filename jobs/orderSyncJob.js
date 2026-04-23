import cron from "node-cron";
import { syncProviderOrders } from "../services /providerStatusSync.js";

export const startOrderSyncJob = (io) => {
  console.log("⏱️ Order sync cron started");

  // every 1 minute
  cron.schedule("* * * * *", async () => {
    console.log("🔄 Running order sync...");
    await syncProviderOrders(io);
  });
};
