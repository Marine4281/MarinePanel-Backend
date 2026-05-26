import CpAdminLog from "../models/CpAdminLog.js";
import User from "../models/User.js";

const EXCLUDED_ACTIONS = [
  "VIEW_PROFILE", "VIEW_CP_LOGS", "CP_LOGIN", "VIEW_USER", "VIEW_USERS",
  "VIEW_ADMIN_LOGS", "ADMIN_LOGIN",
];

// GET /api/cp/logs
export const getCpAdminLogs = async (req, res) => {
  try {
    const cpOwnerId = req.user._id; // set by cpOwnerOnly middleware in app.js

    let { page = 1, limit = 50, action, actions, admin, dateFrom, dateTo } = req.query;

    page  = Math.max(1, parseInt(page,  10) || 1);
    limit = Math.max(1, Math.min(100, parseInt(limit, 10) || 50));

    // Scoped to this CP owner's own actions only
    const query = { admin: cpOwnerId };

    // ── Action filter ─────────────────────────────────────────────
    if (action) {
      if (EXCLUDED_ACTIONS.includes(action.toUpperCase())) {
        return res.json({ logs: [], total: 0, page, pages: 0 });
      }
      query.action = action.toUpperCase();
    } else if (actions) {
      const list = actions
        .split(",")
        .map((a) => a.trim().toUpperCase())
        .filter((a) => !EXCLUDED_ACTIONS.includes(a));

      if (list.length === 0) return res.json({ logs: [], total: 0, page, pages: 0 });
      query.action = { $in: list };
    } else {
      query.action = { $nin: EXCLUDED_ACTIONS };
    }

    // ── Admin search (sub-admins if you add them later) ───────────
    if (admin?.trim()) {
      const matched = await User.find({
        $or: [
          { name:  { $regex: admin.trim(), $options: "i" } },
          { email: { $regex: admin.trim(), $options: "i" } },
        ],
      }).select("_id");

      const ids = matched.map((u) => u._id);
      if (ids.length === 0) return res.json({ logs: [], total: 0, page, pages: 0 });
      query.admin = { $in: ids };
    }

    // ── Date range ────────────────────────────────────────────────
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        query.createdAt.$lte = end;
      }
    }

    const [logs, total] = await Promise.all([
      CpAdminLog.find(query)
        .populate("admin", "name email")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      CpAdminLog.countDocuments(query),
    ]);

    res.json({ logs, total, page, pages: Math.ceil(total / limit) });

  } catch (error) {
    console.error("GET CP LOGS ERROR:", error);
    res.status(500).json({ message: "Failed to fetch CP logs" });
  }
};
