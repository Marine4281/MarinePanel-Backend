import CpAdminLog from "../models/CpAdminLog.js";

const logCpAdminAction = async ({
  adminId,
  adminEmail = null,
  childPanelId,
  action,
  targetType = null,
  targetId = null,
  description = "",
  ipAddress = null,
  meta = {},
}) => {
  try {
    if (!adminId || !action || !childPanelId) {
      console.warn("⚠️ Skipping invalid CP admin log:", { adminId, action, childPanelId });
      return;
    }

    const logData = { admin: adminId, childPanel: childPanelId, action };

    if (adminEmail)  logData.adminEmail  = adminEmail;
    if (targetType)  logData.targetType  = targetType;
    if (targetId)    logData.targetId    = targetId;
    if (description) logData.description = description;
    if (ipAddress)   logData.ipAddress   = ipAddress;
    if (meta && Object.keys(meta).length > 0) logData.meta = meta;

    await CpAdminLog.create(logData);
  } catch (error) {
    console.error("CP Admin Log Error:", error.message);
  }
};

export default logCpAdminAction;
