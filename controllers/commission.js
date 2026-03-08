import Settings from "../models/Settings.js";
import { io } from "../server.js"; // or wherever your socket.io server is initialized

/**
 * GET /api/settings/commission
 * Public endpoint to get the current global commission
 */
export const getPublicCommission = async (req, res) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) settings = await Settings.create({ commission: 50, totalRevenue: 0 });

    res.json({ commission: settings.commission });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch commission" });
  }
};

/**
 * SOCKET UPDATE
 * Call this when admin updates commission in /admin/settings/commission
 */
export const emitCommissionUpdate = async () => {
  try {
    const settings = await Settings.findOne();
    if (!settings) return;
    // Broadcast to all connected clients
    io.emit("commissionUpdated", { commission: settings.commission });
  } catch (err) {
    console.error("Failed to emit commission update:", err);
  }
};
