// src/utils/networkManager.js

// Import all your existing API functions
import { getWallet } from "../api/walletApi";
import { getProfile } from "../api/profileApi";
import { getOrders } from "../api/orderApi";
import { getServices } from "../api/serviceApi";

/**
 * Central function to refresh all important data.
 * Call this when internet reconnects or manually if needed.
 */
export const refreshAllData = async () => {
  if (!navigator.onLine) {
    console.log("Offline: skipping data refresh");
    return;
  }

  try {
    await Promise.all([
      getWallet(),
      getProfile(),
      getOrders(),
      getServices(),
    ]);
    console.log("All data synced after reconnect");
  } catch (err) {
    console.error("Failed to refresh all data:", err);
  }
};

/**
 * Setup the network manager to handle reconnection events.
 * Call this once in App.js (or main layout) inside useEffect.
 */
export const setupNetworkManager = () => {
  // Trigger data refresh when internet reconnects
  window.addEventListener("online", refreshAllData);

  // Optional: log when internet goes offline
  window.addEventListener("offline", () => {
    console.log("Internet connection lost");
  });

  // Cleanup function (optional if needed)
  return () => {
    window.removeEventListener("online", refreshAllData);
    window.removeEventListener("offline", () => {});
  };
};
