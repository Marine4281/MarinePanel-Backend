//utils//logAdminAction.js
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
