import AdminLog from "../models/AdminLog.js";

export const getAdminLogs = async (req, res) => {
  try {
    const { page = 1, limit = 20, action, admin } = req.query;

    const query = {};

    if (action) query.action = action;
    if (admin) query.admin = admin;

    const logs = await AdminLog.find(query)
      .populate("admin", "name email")
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await AdminLog.countDocuments(query);

    res.json({
      logs,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
