// utils/apiLogger.js
import ApiLog from "../models/ApiLog.js";

const maskKey = (key) => {
  if (!key || key.length < 10) return "••••••";
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
};

export const logApiCall = ({ user, key, action, success, errorMessage, ip, durationMs }) => {
  ApiLog.create({
    user: user?._id || null,
    apiKeyMasked: maskKey(key),
    action: action || "unknown",
    success: success !== false,
    errorMessage: errorMessage || null,
    ip,
    durationMs,
  }).catch((err) => console.error("ApiLog write failed:", err.message));
};
