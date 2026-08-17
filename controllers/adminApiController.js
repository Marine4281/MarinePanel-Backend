// controllers/adminApiController.js
import User from "../models/User.js";
import Order from "../models/Order.js";
import ApiLog from "../models/ApiLog.js";
import Settings from "../models/Settings.js";
import crypto from "crypto";

const maskKey = (key) => {
  if (!key || key.length < 10) return "••••••";
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
};

/* GET /api/admin/api/overview */
export const getApiOverview = async (req, res) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) settings = await Settings.create({});

    const [totalApiOrders, totalApiUsers, last24hCalls, last24hErrors] = await Promise.all([
      Order.countDocuments({ orderSource: "api" }),
      User.countDocuments({ apiAccessEnabled: true }),
      ApiLog.countDocuments({ createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }),
      ApiLog.countDocuments({
        success: false,
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      }),
    ]);

    res.json({
      apiEnabled: settings.apiEnabled,
      apiRateLimitPerMinute: settings.apiRateLimitPerMinute,
      totalApiOrders,
      totalApiUsers,
      last24hCalls,
      last24hErrors,
    });
  } catch (err) {
    console.error("getApiOverview error:", err);
    res.status(500).json({ message: "Failed to load API overview" });
  }
};

/* PUT /api/admin/api/settings  body: { apiEnabled?, apiRateLimitPerMinute? } */
export const updateApiSettings = async (req, res) => {
  try {
    const { apiEnabled, apiRateLimitPerMinute } = req.body;
    let settings = await Settings.findOne();
    if (!settings) settings = new Settings();

    if (typeof apiEnabled === "boolean") settings.apiEnabled = apiEnabled;
    if (apiRateLimitPerMinute !== undefined) {
      const val = Number(apiRateLimitPerMinute);
      if (!val || val < 1) {
        return res.status(400).json({ message: "Rate limit must be a positive number" });
      }
      settings.apiRateLimitPerMinute = val;
    }

    await settings.save();
    res.json({ apiEnabled: settings.apiEnabled, apiRateLimitPerMinute: settings.apiRateLimitPerMinute });
  } catch (err) {
    console.error("updateApiSettings error:", err);
    res.status(500).json({ message: "Failed to update API settings" });
  }
};

/* GET /api/admin/api/users?page=1&limit=20&search= */
export const getApiUsers = async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Number(req.query.limit) || 20);
    const search = (req.query.search || "").trim();

    const query = { apiAccessEnabled: true };
    if (search) {
      query.$or = [
        { username: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    const [users, total] = await Promise.all([
      User.find(query)
        .select("username email apiKey apiAccessEnabled createdAt")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      User.countDocuments(query),
    ]);

    const userIds = users.map((u) => u._id);

    // Order counts + last-used, per user, in two aggregations
    const [orderCounts, lastUsed] = await Promise.all([
      Order.aggregate([
        { $match: { orderSource: "api", userId: { $in: userIds } } },
        { $group: { _id: "$userId", count: { $sum: 1 } } },
      ]),
      ApiLog.aggregate([
        { $match: { user: { $in: userIds } } },
        { $group: { _id: "$user", lastUsed: { $max: "$createdAt" } } },
      ]),
    ]);

    const orderCountMap = Object.fromEntries(orderCounts.map((o) => [String(o._id), o.count]));
    const lastUsedMap = Object.fromEntries(lastUsed.map((l) => [String(l._id), l.lastUsed]));

    const data = users.map((u) => ({
      _id: u._id,
      username: u.username,
      email: u.email,
      apiKeyMasked: maskKey(u.apiKey),
      apiAccessEnabled: u.apiAccessEnabled,
      orderCount: orderCountMap[String(u._id)] || 0,
      lastUsed: lastUsedMap[String(u._id)] || null,
      createdAt: u.createdAt,
    }));

    res.json({ users: data, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error("getApiUsers error:", err);
    res.status(500).json({ message: "Failed to load API users" });
  }
};

/* POST /api/admin/api/users/:id/regenerate */
export const regenerateApiKey = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const apiKey = "mk_" + crypto.randomBytes(24).toString("hex");
    user.apiKey = apiKey;
    user.apiAccessEnabled = true;
    await user.save();

    res.json({ apiKeyMasked: maskKey(apiKey) });
  } catch (err) {
    console.error("regenerateApiKey error:", err);
    res.status(500).json({ message: "Failed to regenerate API key" });
  }
};

/* POST /api/admin/api/users/:id/revoke */
export const revokeApiKey = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.apiKey = undefined;
    user.apiAccessEnabled = false;
    await user.save();

    res.json({ message: "API access revoked" });
  } catch (err) {
    console.error("revokeApiKey error:", err);
    res.status(500).json({ message: "Failed to revoke API key" });
  }
};

/* PUT /api/admin/api/users/:id/toggle  body: { enabled } */
export const toggleApiAccess = async (req, res) => {
  try {
    const { enabled } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (!user.apiKey) return res.status(400).json({ message: "User has no API key to toggle" });

    user.apiAccessEnabled = !!enabled;
    await user.save();

    res.json({ apiAccessEnabled: user.apiAccessEnabled });
  } catch (err) {
    console.error("toggleApiAccess error:", err);
    res.status(500).json({ message: "Failed to update API access" });
  }
};

/* GET /api/admin/api/usage — calls per action + success/error split + 14-day time series */
export const getApiUsage = async (req, res) => {
  try {
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

    const [byAction, timeSeries] = await Promise.all([
      ApiLog.aggregate([
        { $match: { createdAt: { $gte: since } } },
        {
          $group: {
            _id: { action: "$action", success: "$success" },
            count: { $sum: 1 },
          },
        },
      ]),
      ApiLog.aggregate([
        { $match: { createdAt: { $gte: since } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            total: { $sum: 1 },
            errors: { $sum: { $cond: [{ $eq: ["$success", false] }, 1, 0] } },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    const actionMap = {};
    for (const row of byAction) {
      const a = row._id.action || "unknown";
      if (!actionMap[a]) actionMap[a] = { action: a, success: 0, error: 0 };
      if (row._id.success) actionMap[a].success += row.count;
      else actionMap[a].error += row.count;
    }

    res.json({
      byAction: Object.values(actionMap),
      timeSeries: timeSeries.map((t) => ({ date: t._id, total: t.total, errors: t.errors })),
    });
  } catch (err) {
    console.error("getApiUsage error:", err);
    res.status(500).json({ message: "Failed to load API usage" });
  }
};

/* GET /api/admin/api/logs?page=1&limit=50 */
export const getApiLogs = async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Number(req.query.limit) || 50);

    const [logs, total] = await Promise.all([
      ApiLog.find()
        .populate("user", "username email")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      ApiLog.countDocuments(),
    ]);

    res.json({ logs, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error("getApiLogs error:", err);
    res.status(500).json({ message: "Failed to load API logs" });
  }
};

/* GET /api/admin/api/leaderboard — top users by successful API orders placed */
export const getApiLeaderboard = async (req, res) => {
  try {
    const limit = Math.min(50, Number(req.query.limit) || 10);

    const leaderboard = await ApiLog.aggregate([
      { $match: { action: "add", success: true, user: { $ne: null } } },
      { $group: { _id: "$user", orderCount: { $sum: 1 } } },
      { $sort: { orderCount: -1 } },
      { $limit: limit },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: "$user" },
      {
        $project: {
          _id: 0,
          userId: "$user._id",
          username: "$user.username",
          email: "$user.email",
          orderCount: 1,
        },
      },
    ]);

    res.json({ leaderboard });
  } catch (err) {
    console.error("getApiLeaderboard error:", err);
    res.status(500).json({ message: "Failed to load API leaderboard" });
  }
};
