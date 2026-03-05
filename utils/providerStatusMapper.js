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
  if (status.includes("complete")) return "completed";

  // Partial → still processing
  if (status.includes("partial")) return "processing";

  // Processing / In progress
  if (
    status.includes("process") ||
    status.includes("progress") ||
    status.includes("in progress")
  ) {
    return "processing";
  }

  // Pending
  if (status.includes("pending")) return "pending";

  // Cancelled / Canceled
  if (status.includes("cancel")) return "failed";

  // Refund
  if (status.includes("refund")) return "refunded";

  // Failed
  if (status.includes("fail") || status.includes("error")) return "failed";

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
