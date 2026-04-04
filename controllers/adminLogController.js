// controllers/adminLogController.js
import AdminLog from "../models/AdminLog.js";
import logAdminAction from "../utils/logAdminAction.js";

// GET /api/admin-logs
export const getAdminLogs = async (req, res) => {
  try {
    let { page = 1, limit = 20, action, admin } = req.query;

    // Convert query params to numbers
    page = parseInt(page, 10);
    limit = parseInt(limit, 10);

    const query = {};
    if (action) query.action = action;
    if (admin) query.admin = admin;

    const logs = await AdminLog.find(query)
      .populate("admin", "name email")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await AdminLog.countDocuments(query);

    // 🔥 Log admin viewing logs
    await logAdminAction(
      req.user._id,
      "VIEW_ADMIN_LOGS",
      `Viewed admin logs${action ? ` for action: ${action}` : ""}`
    );

    res.json({
      logs,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("GET ADMIN LOGS ERROR:", error);
    res.status(500).json({ message: "Failed to fetch admin logs" });
  }
};
