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

  if (!status) return "processing";

  // Completed
  if (status.includes("complete")) return "completed";

  // Partial stays processing in your system
  if (status.includes("partial")) return "processing";

  // In progress / processing
  if (status.includes("progress")) return "processing";
  if (status.includes("process")) return "processing";

  // Pending
  if (status.includes("pending")) return "pending";

  // Cancel / Cancelled / Canceled
  if (status.includes("cancel")) return "failed";

  // Failed / Error
  if (status.includes("fail")) return "failed";
  if (status.includes("error")) return "failed";

  // Default fallback
  return "processing";
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
