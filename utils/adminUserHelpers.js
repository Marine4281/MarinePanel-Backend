// utils/adminUserHelpers.js

export const normalizeCountryCode = (value) => {
  if (!value || typeof value !== "string") return "US";
  const map = {
    "united states": "US",
    usa: "US",
    us: "US",
    kenya: "KE",
  };
  const cleaned = value.trim().toLowerCase();
  return map[cleaned] || cleaned.toUpperCase();
};

// Derive user type tags from user document
export const getUserTypes = (user) => {
  const types = [];
  if (user.isChildPanel) types.push("Child Panel");
  if (user.isReseller) types.push("Reseller");
  if (user.apiAccessEnabled) types.push("API");
  if (types.length === 0) types.push("User");
  return types;
};
