// controllers/cpNotificationController.js
//
// Child panel owner managing their own notifications.
// Every query is scoped to cpOwner: req.user._id so it is
// impossible to read or modify another panel's notifications,
// and impossible to touch the main admin's notifications.

import Notification from "../models/Notification.js";
import NotificationDismissal from "../models/NotificationDismissal.js";
import logCpAdminAction from "../utils/logCpAdminAction.js";

// GET /api/cp/notifications  (history — newest first)
export const getCPNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({ cpOwner: req.user._id })
      .sort({ createdAt: -1 });
    res.json(notifications);
  } catch (err) {
    console.error("getCPNotifications error:", err);
    res.status(500).json({ message: "Failed to fetch notifications" });
  }
};

// POST /api/cp/notifications
export const createCPNotification = async (req, res) => {
  try {
    const { title, message, cpAudience, limitType, limitValue, isActive } =
      req.body;

    if (!title?.trim() || !message?.trim()) {
      return res.status(400).json({ message: "Title and message are required" });
    }

    // Only one notification active at a time PER CP OWNER —
    // deactivate this CP owner's others without touching the
    // admin's or any other panel's notifications.
    if (isActive !== false) {
      await Notification.updateMany(
        { cpOwner: req.user._id, isActive: true },
        { isActive: false }
      );
    }

    const notification = await Notification.create({
      title: title.trim(),
      message: message.trim(),
      cpAudience: cpAudience || "own",
      limitType: limitType || "dismissCount",
      limitValue: limitValue || 3,
      isActive: isActive !== false,
      createdBy: req.user._id,
      cpOwner: req.user._id,
    });

    logCpAdminAction({
      adminId: req.user._id,
      adminEmail: req.user.email,
      childPanelId: req.user._id,
      action: "CREATE_NOTIFICATION",
      targetType: "Notification",
      targetId: notification._id,
      description: `Created notification "${notification.title}"`,
      ipAddress: req.ip,
    }).catch(() => {});

    res.status(201).json(notification);
  } catch (err) {
    console.error("createCPNotification error:", err);
    res.status(500).json({ message: "Failed to create notification" });
  }
};

// PUT /api/cp/notifications/:id
export const updateCPNotification = async (req, res) => {
  try {
    const { title, message, cpAudience, limitType, limitValue, isActive } =
      req.body;

    const notification = await Notification.findOne({
      _id: req.params.id,
      cpOwner: req.user._id,
    });
    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    if (isActive === true) {
      await Notification.updateMany(
        { _id: { $ne: notification._id }, cpOwner: req.user._id, isActive: true },
        { isActive: false }
      );
    }

    if (title !== undefined) notification.title = title.trim();
    if (message !== undefined) notification.message = message.trim();
    if (cpAudience !== undefined) notification.cpAudience = cpAudience;
    if (limitType !== undefined) notification.limitType = limitType;
    if (limitValue !== undefined) notification.limitValue = limitValue;
    if (isActive !== undefined) notification.isActive = isActive;

    await notification.save();

    logCpAdminAction({
      adminId: req.user._id,
      adminEmail: req.user.email,
      childPanelId: req.user._id,
      action: "UPDATE_NOTIFICATION",
      targetType: "Notification",
      targetId: notification._id,
      description: `Updated notification "${notification.title}"`,
      ipAddress: req.ip,
    }).catch(() => {});

    res.json(notification);
  } catch (err) {
    console.error("updateCPNotification error:", err);
    res.status(500).json({ message: "Failed to update notification" });
  }
};

// DELETE /api/cp/notifications/:id
export const deleteCPNotification = async (req, res) => {
  try {
    const notification = await Notification.findOne({
      _id: req.params.id,
      cpOwner: req.user._id,
    });
    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    await Notification.deleteOne({ _id: notification._id });
    await NotificationDismissal.deleteMany({ notificationId: notification._id });

    logCpAdminAction({
      adminId: req.user._id,
      adminEmail: req.user.email,
      childPanelId: req.user._id,
      action: "DELETE_NOTIFICATION",
      targetType: "Notification",
      targetId: notification._id,
      description: `Deleted notification "${notification.title}"`,
      ipAddress: req.ip,
    }).catch(() => {});

    res.json({ message: "Notification deleted" });
  } catch (err) {
    console.error("deleteCPNotification error:", err);
    res.status(500).json({ message: "Failed to delete notification" });
  }
};
