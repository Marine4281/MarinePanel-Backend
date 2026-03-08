// src/controllers/AdminSettingsController.js
import Settings from "../models/Settings.js";
import Order from "../models/Order.js";
import { emitCommissionUpdate } from "./commission.js"; // 🔥 For real-time updates

/**
 * GET /api/admin/settings/commission
 * Fetch current default commission
 */
export const getCommission = async (req, res) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) {
      settings = await Settings.create({ commission: 50, totalRevenue: 0 });
    }
    res.json({ commission: settings.commission });
  } catch (err) {
    console.error("Error fetching commission:", err);
    res.status(500).json({ message: "Failed to fetch commission" });
  }
};

/**
 * PUT /api/admin/settings/commission
 * Update commission
 */
export const updateCommission = async (req, res) => {
  try {
    const { commission } = req.body;

    // Validate commission value
    if (commission === undefined || commission < 0 || commission > 100) {
      return res.status(400).json({ message: "Commission value must be between 0 and 100" });
    }

    // Fetch existing settings or create new
    let settings = await Settings.findOne();
    if (!settings) {
      settings = await Settings.create({ commission, totalRevenue: 0 });
    } else {
      settings.commission = commission;
      await settings.save();
    }

    // 🔥 Emit real-time commission update to all connected clients
    emitCommissionUpdate();

    res.json({ commission: settings.commission });
  } catch (err) {
    console.error("Error updating commission:", err);
    res.status(500).json({ message: "Failed to update commission" });
  }
};

/**
 * POST /api/admin/settings/reset-revenue
 * Reset total revenue counter
 */
export const resetRevenue = async (req, res) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) {
      settings = await Settings.create({ commission: 50, totalRevenue: 0 });
    } else {
      settings.totalRevenue = 0;
      await settings.save();
    }

    res.json({ message: "Revenue reset successfully", totalRevenue: settings.totalRevenue });
  } catch (err) {
    console.error("Error resetting revenue:", err);
    res.status(500).json({ message: "Failed to reset revenue" });
  }
};
