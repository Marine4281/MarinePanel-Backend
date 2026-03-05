// utils/providerStatusMapper.js

// ===============================================
// NORMALIZE PROVIDER STATUS (case insensitive)
// ===============================================
const normalizeStatus = (status) => {
  if (!status) return "";
  return String(status).trim().toLowerCase();
};

// ===============================================
// MAP PROVIDER STATUS → YOUR SYSTEM STATUS
// ===============================================
export const mapProviderStatus = (providerStatus) => {
  const status = normalizeStatus(providerStatus);

  if (!status) return "pending";

  // Completed
  if (status.includes("Completed")) return "completed";
  if (status.includes("completed")) return "completed";

  // Partial stays processing in your system
  if (status.includes("partial")) return "processing";

  // In progress / processing
  if (status.includes("progress")) return "processing";
  if (status.includes("process")) return "processing";
  if (status.includes("processing")) return "processing";
  if (status.includes("Processing")) return "processing";
  if (status.includes("In progress")) return "processing";

  // Pending
  if (status.includes("pending")) return "pending";
  if (status.includes("Pending")) return "pending";

  // Cancel / Cancelled / Canceled
  if (status.includes("Canceled")) return "failed";
  if (status.includes("canceled")) return "failed";

  // Failed / Error
  if (status.includes("fail")) return "failed";
  if (status.includes("failed")) return "failed";

  // Default fallback
  return "pending";
};

// ===============================================
// CALCULATE DELIVERED COUNT FROM REMAINS
// ===============================================
export const calculateDelivered = (totalQuantity, remains) => {
  const total = Number(totalQuantity) || 0;
  const remaining = Number(remains);

  if (isNaN(remaining)) return 0;

  const delivered = total - remaining;

  if (delivered < 0) return 0;
  if (delivered > total) return total;

  return delivered;
};
