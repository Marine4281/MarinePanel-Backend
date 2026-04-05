// controllers/adminLogController.js

import AdminLog from "../models/AdminLog.js";
import logAdminAction from "../utils/logAdminAction.js";

// ======================= GET ADMIN LOGS =======================
// GET /api/admin-logs
export const getAdminLogs = async (req, res) => {
  try {
    let { page = 1, limit = 20, action, admin } = req.query;

    // ✅ Ensure valid numbers
    page = Math.max(1, parseInt(page, 10) || 1);
    limit = Math.max(1, Math.min(100, parseInt(limit, 10) || 20)); // max 100

    const query = {};

    // ✅ Filters
    if (action) query.action = action;
    if (admin) query.admin = admin;

    // ✅ Exclude VIEW_PROFILE, VIEW_ADMIN_LOGS, and ADMIN_LOGIN
    query.action = { $nin: ["VIEW_PROFILE", "VIEW_ADMIN_LOGS", "ADMIN_LOGIN"] };

    // ✅ Fetch logs
    const logs = await AdminLog.find(query)
      .populate("admin", "name email")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await AdminLog.countDocuments(query);

    // 🔥 SAFE: Log that admin viewed logs (optional)
    if (req.user?.isAdmin) {
      logAdminAction({
        adminId: req.user._id,
        adminEmail: req.user.email,
        action: "VIEW_ADMIN_LOGS",
        description: `Viewed admin logs${
          action ? ` (filtered by: ${action})` : ""
        }`,
        ipAddress: req.ip,
      }).catch((err) =>
        console.error("Admin log error (VIEW LOGS):", err.message)
      );
    }

    res.json({
      logs,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("GET ADMIN LOGS ERROR:", error);
    res.status(500).json({
      message: "Failed to fetch admin logs",
    });
  }
};
