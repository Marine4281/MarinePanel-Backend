// utils/logAdminAction.js

import AdminLog from "../models/AdminLog.js";

const logAdminAction = async ({
  adminId,
  action,
  targetType,
  targetId,
  description,
  ipAddress,
}) => {
  try {
    // 🔥 HARD GUARD (prevents crashes)
    if (!adminId || !action) {
      console.warn("⚠️ Skipping invalid admin log:", {
        adminId,
        action,
      });
      return;
    }

    await AdminLog.create({
      admin: adminId,
      action,
      targetType,
      targetId,
      description,
      ipAddress,
    });
  } catch (error) {
    console.error("Admin Log Error:", error.message);
  }
};

export default logAdminAction;
