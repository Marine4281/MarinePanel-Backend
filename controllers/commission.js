// controllers/commission.js
import Settings from "../models/Settings.js";

/**
 * GET /api/settings/commission
 * Public endpoint to get the current global commission
 */
export const getPublicCommission = async (req, res) => {
  try {
    let settings = await Settings.findOne();
    if (!settings)
      settings = await Settings.create({ commission: 50, totalRevenue: 0 });

    res.json({ commission: settings.commission });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch commission" });
  }
};

/**
 * SOCKET UPDATE
 * Call this when admin updates commission in /admin/settings/commission.
 * Pass `req` so we can get `io` from app — avoids circular import with server.js.
 */
export const emitCommissionUpdate = async (req) => {
  try {
    const io = req?.app?.get("io");
    if (!io) return;

    const settings = await Settings.findOne();
    if (!settings) return;

    io.emit("commissionUpdated", { commission: settings.commission });
  } catch (err) {
    console.error("Failed to emit commission update:", err);
  }
};
