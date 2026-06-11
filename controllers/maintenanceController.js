// controllers/maintenanceController.js
import Settings from "../models/Settings.js";
import logAdminAction from "../utils/logAdminAction.js";

/**
 * GET /api/admin/settings/maintenance
 */
export const getMaintenanceSettings = async (req, res) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) settings = await Settings.create({});

    res.json({
      totalShutdown: settings.maintenanceTotalShutdown,
      noOrders: settings.maintenanceNoOrders,
    });
  } catch (err) {
    console.error("getMaintenanceSettings error:", err);
    res.status(500).json({ message: "Failed to fetch maintenance settings" });
  }
};

/**
 * PUT /api/admin/settings/maintenance
 * Body: { totalShutdown: {...}, noOrders: {...} }
 */
export const updateMaintenanceSettings = async (req, res) => {
  try {
    const { totalShutdown, noOrders } = req.body;

    let settings = await Settings.findOne();
    if (!settings) settings = await Settings.create({});

    if (totalShutdown !== undefined) {
      settings.maintenanceTotalShutdown = {
        ...settings.maintenanceTotalShutdown.toObject?.() ?? settings.maintenanceTotalShutdown,
        ...totalShutdown,
      };
    }

    if (noOrders !== undefined) {
      settings.maintenanceNoOrders = {
        ...settings.maintenanceNoOrders.toObject?.() ?? settings.maintenanceNoOrders,
        ...noOrders,
      };
    }

    settings.markModified("maintenanceTotalShutdown");
    settings.markModified("maintenanceNoOrders");
    await settings.save();

    await logAdminAction({
      adminId: req.user._id,
      adminEmail: req.user.email,
      action: "UPDATE_MAINTENANCE",
      description: "Updated maintenance mode settings",
      ipAddress: req.ip,
    });

    res.json({
      message: "Maintenance settings updated",
      totalShutdown: settings.maintenanceTotalShutdown,
      noOrders: settings.maintenanceNoOrders,
    });
  } catch (err) {
    console.error("updateMaintenanceSettings error:", err);
    res.status(500).json({ message: "Failed to update maintenance settings" });
  }
};

/**
 * GET /api/maintenance/status
 * PUBLIC — called by frontend on every page load to check if maintenance is active for the current user
 * Body via query: ?role=user|reseller|cpOwner|admin&scope=platform|<cpId>
 */
export const getMaintenanceStatus = async (req, res) => {
  try {
    const settings = await Settings.findOne();
    if (!settings) return res.json({ totalShutdown: false, noOrders: false });

    const ts = settings.maintenanceTotalShutdown;
    const no = settings.maintenanceNoOrders;

    // role can be passed as query param (frontend passes it when known)
    const role = req.query.role || "user"; // admin | cpOwner | reseller | user
    const userEmail = req.query.email || "";

    const isAffected = (mode) => {
      if (!mode.enabled) return false;

      // Exempt by email
      if (userEmail && mode.exempt?.includes(userEmail)) return false;

      // Exempt by role
      if (role === "admin") return false; // admin is ALWAYS exempt from the UI
      if (mode.exemptRoles?.includes(role)) return false;

      // Scope check
      switch (mode.affects) {
        case "everyone":
          return true;
        case "cp_and_users":
          return role === "user"; // only CP end-users
        case "resellers_and_users":
          return role === "reseller" || role === "user";
        case "platform_users":
          return role === "user";
        default:
          return true;
      }
    };

    res.json({
      totalShutdown: isAffected(ts)
        ? { active: true, title: ts.title, message: ts.message }
        : { active: false },
      noOrders: isAffected(no)
        ? { active: true, message: no.message }
        : { active: false },
    });
  } catch (err) {
    console.error("getMaintenanceStatus error:", err);
    res.status(500).json({ message: "Failed to check maintenance status" });
  }
};
