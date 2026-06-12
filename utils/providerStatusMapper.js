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
  if (status.includes("partial")) return "partial";

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

// ===============================================
// FORMAT STATUS FOR API RESPONSES (status action)
// Uses the RAW provider status (order.providerStatus) so API
// users see exactly what the provider reports — e.g. "In progress"
// even if remains is 0 and our internal order.status was
// auto-flipped to "completed" for commission/refund purposes.
// Falls back to the internal order.status if no provider
// status has been synced yet (e.g. order never reached provider).
// ===============================================
export const formatProviderStatusDisplay = (order) => {
  const raw = normalizeStatus(order.providerStatus);

  if (raw) {
    if (raw.includes("complete")) return "Completed";
    if (raw.includes("partial")) return "Partial";
    if (raw.includes("in progress") || raw.includes("inprogress")) return "In progress";
    if (raw.includes("process")) return "Processing";
    if (raw.includes("pending")) return "Pending";
    if (raw.includes("cancel")) return "Canceled";
    if (raw.includes("refund")) return "Refunded";
    if (raw.includes("fail") || raw.includes("error")) return "Failed";
  }

  // No provider status synced yet — fall back to internal status
  const fallbackMap = {
    pending: "Pending",
    processing: "Processing",
    completed: "Completed",
    partial: "Partial",
    cancelled: "Canceled",
    failed: "Failed",
    refunded: "Refunded",
  };
  return fallbackMap[order.status] || "Pending";
};
