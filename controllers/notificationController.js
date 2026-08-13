// controllers/notificationController.js
import Notification from "../models/Notification.js";
import NotificationDismissal from "../models/NotificationDismissal.js";
import logAdminAction from "../utils/logAdminAction.js";

/* ============================================================
   ADMIN — CRUD + HISTORY
   ============================================================ */

// GET /api/admin/notifications  (history — newest first)
export const getNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find()
      .sort({ createdAt: -1 })
      .populate("createdBy", "email");
    res.json(notifications);
  } catch (err) {
    console.error("getNotifications error:", err);
    res.status(500).json({ message: "Failed to fetch notifications" });
  }
};

// POST /api/admin/notifications
export const createNotification = async (req, res) => {
  try {
    const { title, message, audience, limitType, limitValue, isActive } =
      req.body;

    if (!title?.trim() || !message?.trim()) {
      return res.status(400).json({ message: "Title and message are required" });
    }

    // Only one notification active at a time — deactivate any others
    // if this one is being created as active.
    if (isActive !== false) {
      await Notification.updateMany({ isActive: true }, { isActive: false });
    }

    const notification = await Notification.create({
      title: title.trim(),
      message: message.trim(),
      audience: audience || "platform",
      limitType: limitType || "dismissCount",
      limitValue: limitValue || 3,
      isActive: isActive !== false,
      createdBy: req.user._id,
    });

    await logAdminAction({
      adminId: req.user._id,
      adminEmail: req.user.email,
      action: "CREATE_NOTIFICATION",
      description: `Created notification "${notification.title}"`,
      ipAddress: req.ip,
    });

    res.status(201).json(notification);
  } catch (err) {
    console.error("createNotification error:", err);
    res.status(500).json({ message: "Failed to create notification" });
  }
};

// PUT /api/admin/notifications/:id
export const updateNotification = async (req, res) => {
  try {
    const { title, message, audience, limitType, limitValue, isActive } =
      req.body;

    const notification = await Notification.findById(req.params.id);
    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    // Enforce "one active at a time"
    if (isActive === true) {
      await Notification.updateMany(
        { _id: { $ne: notification._id }, isActive: true },
        { isActive: false }
      );
    }

    if (title !== undefined) notification.title = title.trim();
    if (message !== undefined) notification.message = message.trim();
    if (audience !== undefined) notification.audience = audience;
    if (limitType !== undefined) notification.limitType = limitType;
    if (limitValue !== undefined) notification.limitValue = limitValue;
    if (isActive !== undefined) notification.isActive = isActive;

    await notification.save();

    await logAdminAction({
      adminId: req.user._id,
      adminEmail: req.user.email,
      action: "UPDATE_NOTIFICATION",
      description: `Updated notification "${notification.title}"`,
      ipAddress: req.ip,
    });

    res.json(notification);
  } catch (err) {
    console.error("updateNotification error:", err);
    res.status(500).json({ message: "Failed to update notification" });
  }
};

// DELETE /api/admin/notifications/:id
export const deleteNotification = async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    await Notification.deleteOne({ _id: notification._id });
    await NotificationDismissal.deleteMany({ notificationId: notification._id });

    await logAdminAction({
      adminId: req.user._id,
      adminEmail: req.user.email,
      action: "DELETE_NOTIFICATION",
      description: `Deleted notification "${notification.title}"`,
      ipAddress: req.ip,
    });

    res.json({ message: "Notification deleted" });
  } catch (err) {
    console.error("deleteNotification error:", err);
    res.status(500).json({ message: "Failed to delete notification" });
  }
};

/* ============================================================
   USER-FACING
   ============================================================ */

// Figures out which audience bucket the logged-in user falls into
const getUserAudience = (user) => {
  if (user.resellerOwner) return "reseller";
  if (user.scope && user.scope !== "platform") return "cp";
  return "platform";
};

// GET /api/notifications/active
// Auth required — returns the single eligible notification for this user, or null
export const getActiveNotification = async (req, res) => {
  try {
    const notification = await Notification.findOne({ isActive: true });
    if (!notification) return res.json({ notification: null });

    const userAudience = getUserAudience(req.user);
    const matchesAudience =
      notification.audience === "all" || notification.audience === userAudience;

    if (!matchesAudience) return res.json({ notification: null });

    // Days-based expiry
    if (notification.limitType === "days") {
      const ageMs = Date.now() - new Date(notification.createdAt).getTime();
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      if (ageDays >= notification.limitValue) {
        return res.json({ notification: null });
      }
    }

    // Dismiss-count based expiry
    let dismissal = null;
    if (notification.limitType === "dismissCount") {
      dismissal = await NotificationDismissal.findOne({
        userId: req.user._id,
        notificationId: notification._id,
      });
      if (dismissal && dismissal.dismissCount >= notification.limitValue) {
        return res.json({ notification: null });
      }
    }

    res.json({
      notification: {
        _id: notification._id,
        title: notification.title,
        message: notification.message,
      },
    });
  } catch (err) {
    console.error("getActiveNotification error:", err);
    res.status(500).json({ message: "Failed to fetch notification" });
  }
};

// POST /api/notifications/:id/dismiss
export const dismissNotification = async (req, res) => {
  try {
    const { id } = req.params;

    const dismissal = await NotificationDismissal.findOneAndUpdate(
      { userId: req.user._id, notificationId: id },
      {
        $inc: { dismissCount: 1 },
        $set: { lastDismissedAt: new Date() },
      },
      { upsert: true, new: true }
    );

    res.json({ message: "Dismissed", dismissCount: dismissal.dismissCount });
  } catch (err) {
    console.error("dismissNotification error:", err);
    res.status(500).json({ message: "Failed to record dismissal" });
  }
};
