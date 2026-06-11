// middlewares/maintenanceMiddleware.js
import Settings from "../models/Settings.js";

/**
 * Blocks order creation if noOrders maintenance mode is active
 * and the requesting user is in the affected group.
 */
export const checkNoOrdersMaintenance = async (req, res, next) => {
  try {
    const settings = await Settings.findOne().lean();
    if (!settings) return next();

    const mode = settings.maintenanceNoOrders;
    if (!mode?.enabled) return next();

    const user = req.user;
    if (!user) return next();

    // Admin always bypasses
    if (user.isAdmin) return next();

    // Exempt by email
    if (mode.exempt?.includes(user.email)) return next();

    // Determine role
    let role = "user";
    if (user.isChildPanel) role = "cpOwner";
    else if (user.isReseller) role = "reseller";

    // Exempt by role
    if (mode.exemptRoles?.includes(role)) return next();

    // Scope / affects check
    const affected = (() => {
      switch (mode.affects) {
        case "everyone":           return true;
        case "cp_and_users":       return role === "user";
        case "resellers_and_users":return role === "reseller" || role === "user";
        case "platform_users":     return role === "user";
        default:                   return true;
      }
    })();

    if (affected) {
      return res.status(503).json({
        code: "MAINTENANCE_NO_ORDERS",
        message: mode.message || "Order placement is temporarily disabled.",
      });
    }

    next();
  } catch (err) {
    console.error("checkNoOrdersMaintenance error:", err);
    next(); // fail open — don't block orders on middleware crash
  }
};
