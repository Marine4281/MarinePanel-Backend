// controllers/adminLogController.js

import AdminLog from "../models/AdminLog.js";
import User from "../models/User.js";
import logAdminAction from "../utils/logAdminAction.js";

const EXCLUDED_ACTIONS = ["VIEW_PROFILE", "VIEW_ADMIN_LOGS", "ADMIN_LOGIN", "VIEW_USER", "VIEW_USERS"];

// GET /api/admin-logs
export const getAdminLogs = async (req, res) => {
  try {
    let { page = 1, limit = 50, action, actions, admin, dateFrom, dateTo } = req.query;

    page  = Math.max(1, parseInt(page, 10) || 1);
    limit = Math.max(1, Math.min(100, parseInt(limit, 10) || 50));

    const query = {};

    // ── Action filter (single or multi) ──────────────────────────
    if (action) {
      // Single action — must not be in the excluded list
      if (EXCLUDED_ACTIONS.includes(action.toUpperCase())) {
        return res.json({ logs: [], total: 0, page, pages: 0 });
      }
      query.action = action.toUpperCase();
    } else if (actions) {
      // Multi-action: ?actions=BLOCK_USER,FREEZE_USER
      const list = actions
        .split(",")
        .map((a) => a.trim().toUpperCase())
        .filter((a) => !EXCLUDED_ACTIONS.includes(a));

      if (list.length === 0) {
        return res.json({ logs: [], total: 0, page, pages: 0 });
      }
      query.action = { $in: list };
    } else {
      // No action filter — exclude noisy view/login actions
      query.action = { $nin: EXCLUDED_ACTIONS };
    }

    // ── Admin search (name or email) ─────────────────────────────
    if (admin && admin.trim()) {
      const matchedAdmins = await User.find({
        $or: [
          { name:  { $regex: admin.trim(), $options: "i" } },
          { email: { $regex: admin.trim(), $options: "i" } },
        ],
      }).select("_id");

      const ids = matchedAdmins.map((u) => u._id);

      if (ids.length === 0) {
        // No matching admins — return empty rather than all logs
        return res.json({ logs: [], total: 0, page, pages: 0 });
      }
      query.admin = { $in: ids };
    }

    // ── Date range ───────────────────────────────────────────────
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        query.createdAt.$lte = end;
      }
    }

    // ── Fetch ─────────────────────────────────────────────────────
    const [logs, total] = await Promise.all([
      AdminLog.find(query)
        .populate("admin", "name email")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      AdminLog.countDocuments(query),   // ✅ uses same query, accurate count
    ]);

    // ── Audit: log the view ───────────────────────────────────────
    if (req.user?.isAdmin) {
      logAdminAction({
        adminId:    req.user._id,
        adminEmail: req.user.email,
        action:     "VIEW_ADMIN_LOGS",
        description: `Viewed admin logs${action ? ` (filtered: ${action})` : ""}`,
        ipAddress:  req.ip,
      }).catch((err) => console.error("Log VIEW_ADMIN_LOGS error:", err.message));
    }

    res.json({ logs, total, page, pages: Math.ceil(total / limit) });

  } catch (error) {
    console.error("GET ADMIN LOGS ERROR:", error);
    res.status(500).json({ message: "Failed to fetch admin logs" });
  }
};
