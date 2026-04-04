// utils/logAdminAction.js

import AdminLog from "../models/AdminLog.js";

const logAdminAction = async ({
  adminId,
  adminEmail = null,
  action,
  targetType = null,
  targetId = null,
  description = "",
  ipAddress = null,
  meta = {}, // 🔥 future-proof (device, browser, etc.)
}) => {
  try {
    // ✅ HARD GUARD (prevents crashes completely)
    if (!adminId || !action) {
      console.warn("⚠️ Skipping invalid admin log:", {
        adminId,
        action,
      });
      return;
    }

    // ✅ Clean payload (avoid saving undefined)
    const logData = {
      admin: adminId,
      action,
    };

    if (adminEmail) logData.adminEmail = adminEmail;
    if (targetType) logData.targetType = targetType;
    if (targetId) logData.targetId = targetId;
    if (description) logData.description = description;
    if (ipAddress) logData.ipAddress = ipAddress;
    if (meta && Object.keys(meta).length > 0) logData.meta = meta;

    await AdminLog.create(logData);
  } catch (error) {
    // ❌ NEVER break app because of logging
    console.error("Admin Log Error:", error.message);
  }
};

export default logAdminAction;
