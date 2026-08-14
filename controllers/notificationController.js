// controllers/notificationController.js
import Notification from "../models/Notification.js";
import NotificationDismissal from "../models/NotificationDismissal.js";
import logAdminAction from "../utils/logAdminAction.js";

/* ============================================================
   ADMIN — CRUD + HISTORY
   Scoped to cpOwner: null so CP-owner-created notifications
   never show up in / get touched by the main admin panel.
   ============================================================ */

// GET /api/admin/notifications  (history — newest first)
export const getNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({ cpOwner: null })
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

    // Only one ADMIN notification active at a time — deactivate any
    // other admin ones if this one is being created as active.
    // CP-owner notifications live in a separate cpOwner scope and
    // are untouched by this.
    if (isActive !== false) {
      await Notification.updateMany(
        { cpOwner: null, isActive: true },
        { isActive: false }
      );
    }

    const notification = await Notification.create({
      title: title.trim(),
      message: message.trim(),
      audience: audience || "platform",
      limitType: limitType || "dismissCount",
      limitValue: limitValue || 3,
      isActive: isActive !== false,
      createdBy: req.user._id,
      cpOwner: null,
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

    const notification = await Notification.findOne({
      _id: req.params.id,
      cpOwner: null,
    });
    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    // Enforce "one active at a time" — admin scope only
    if (isActive === true) {
      await Notification.updateMany(
        { _id: { $ne: notification._id }, cpOwner: null, isActive: true },
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
    const notification = await Notification.findOne({
      _id: req.params.id,
      cpOwner: null,
    });
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

// Figures out which admin-level audience bucket the logged-in
// user falls into (used only for cpOwner: null notifications)
const getUserAudience = (user) => {
  if (user.resellerOwner) return "reseller";
  if (user.scope && user.scope !== "platform") return "cp";
  return "platform";
};

// Figures out whether a user matches a CP-owner-created
// notification's audience targeting
const matchesCpAudience = (notification, user) => {
  const isResellerEndUser = !!user.resellerOwner;
  if (notification.cpAudience === "both") return true;
  if (notification.cpAudience === "resellerEndUsers") return isResellerEndUser;
  return !isResellerEndUser; // "own"
};

// Shared eligibility check (active window + dismiss/day limit)
// Returns the trimmed notification payload, or null if not eligible
const resolveEligibleNotification = async (notification, userId) => {
  if (!notification) return null;

  if (notification.limitType === "days") {
    const ageMs = Date.now() - new Date(notification.createdAt).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    if (ageDays >= notification.limitValue) return null;
  }

  if (notification.limitType === "dismissCount") {
    const dismissal = await NotificationDismissal.findOne({
      userId,
      notificationId: notification._id,
    });
    if (dismissal && dismissal.dismissCount >= notification.limitValue) {
      return null;
    }
  }

  return {
    _id: notification._id,
    title: notification.title,
    message: notification.message,
  };
};

// GET /api/notifications/active
// Auth required — returns the single eligible notification for this user, or null.
// A CP owner's notification (scoped to the user's own child panel) takes
// priority over the main platform's notification when both are active.
export const getActiveNotification = async (req, res) => {
  try {
    const user = req.user;

    // 1. CP-scoped notification, if this user belongs to a child panel
    if (user.childPanelOwner) {
      const cpNotification = await Notification.findOne({
        isActive: true,
        cpOwner: user.childPanelOwner,
      });

      if (cpNotification && matchesCpAudience(cpNotification, user)) {
        const eligible = await resolveEligibleNotification(cpNotification, user._id);
        if (eligible) return res.json({ notification: eligible });
      }
    }

    // 2. Fall back to the main platform / admin notification
    const adminNotification = await Notification.findOne({
      isActive: true,
      cpOwner: null,
    });

    if (adminNotification) {
      const userAudience = getUserAudience(user);
      const matchesAudience =
        adminNotification.audience === "all" ||
        adminNotification.audience === userAudience;

      if (matchesAudience) {
        const eligible = await resolveEligibleNotification(adminNotification, user._id);
        if (eligible) return res.json({ notification: eligible });
      }
    }

    res.json({ notification: null });
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
