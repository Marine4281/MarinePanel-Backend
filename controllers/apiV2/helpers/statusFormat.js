export const formatStatus = (status) => {
  const map = {
    pending: "Pending",
    processing: "Processing",
    completed: "Completed",
    partial: "Partial",
    cancelled: "Canceled",
    failed: "Failed",
    refunded: "Refunded",
  };
  return map[status] || "Pending";
};

export const formatRefillStatus = (status) => {
  const map = {
    pending: "Pending",
    processing: "Processing",
    completed: "Completed",
    rejected: "Rejected",
    failed: "Rejected",
    none: "Pending",
  };
  return map[status] || "Pending";
};
