// src/controllers/AdminSettingsController.js
import Settings from "../models/Settings.js";
import Order from "../models/Order.js";
import { emitCommissionUpdate } from "./commission.js";
import logAdminAction from "../utils/logAdminAction.js";

/**
 * GET /api/admin/settings/commission
 */
export const getCommission = async (req, res) => {
  try {
    let settings = await Settings.findOne();

    if (!settings) {
      settings = await Settings.create({
        commission: 50,
        totalRevenue: 0,
        resellerActivationFee: 25,
        resellerWithdrawMin: 10,
        platformDomain: "marinepanel.online",

        supportWhatsapp: "",
        supportTelegram: "",
        supportWhatsappChannel: "",
      });
    }

    // 🔥 Log admin viewing commission
    await logAdminAction(
      req.user._id,
      "VIEW_COMMISSION",
      "Viewed commission settings"
    );

    res.json({ commission: settings.commission });
  } catch (err) {
    console.error("Error fetching commission:", err);
    res.status(500).json({ message: "Failed to fetch commission" });
  }
};

/**
 * PUT /api/admin/settings/commission
 */
export const updateCommission = async (req, res) => {
  try {
    const { commission } = req.body;

    if (commission === undefined || commission < 0 || commission > 100) {
      return res
        .status(400)
        .json({ message: "Commission value must be between 0 and 100" });
    }

    let settings = await Settings.findOne();

    if (!settings) {
      settings = await Settings.create({
        commission,
        totalRevenue: 0,
      });
    } else {
      settings.commission = commission;
      await settings.save();
    }

    emitCommissionUpdate();

    // 🔥 Log admin updating commission
    await logAdminAction(
      req.user._id,
      "UPDATE_COMMISSION",
      `Updated commission to ${commission}%`
    );

    res.json({ commission: settings.commission });
  } catch (err) {
    console.error("Error updating commission:", err);
    res.status(500).json({ message: "Failed to update commission" });
  }
};

/**
 * GET /api/admin/settings/reseller
 */
export const getResellerSettings = async (req, res) => {
  try {
    let settings = await Settings.findOne();

    if (!settings) {
      settings = await Settings.create({
        commission: 50,
        totalRevenue: 0,
        resellerActivationFee: 25,
        resellerWithdrawMin: 10,
        platformDomain: "marinepanel.online",

        supportWhatsapp: "",
        supportTelegram: "",
        supportWhatsappChannel: "",
      });
    }

    // 🔥 Log admin viewing reseller settings
    await logAdminAction(
      req.user._id,
      "VIEW_RESELLER_SETTINGS",
      "Viewed reseller settings"
    );

    res.json({
      resellerActivationFee: settings.resellerActivationFee,
      resellerWithdrawMin: settings.resellerWithdrawMin,
      platformDomain: settings.platformDomain,

      supportWhatsapp: settings.supportWhatsapp || "",
      supportTelegram: settings.supportTelegram || "",
      supportWhatsappChannel: settings.supportWhatsappChannel || "",
    });
  } catch (err) {
    console.error("Error fetching reseller settings:", err);
    res.status(500).json({ message: "Failed to fetch reseller settings" });
  }
};

/**
 * PUT /api/admin/settings/reseller
 */
export const updateResellerSettings = async (req, res) => {
  try {
    const {
      resellerActivationFee,
      resellerWithdrawMin,
      platformDomain,
      supportWhatsapp,
      supportTelegram,
      supportWhatsappChannel,
    } = req.body;

    let settings = await Settings.findOne();

    if (!settings) {
      settings = await Settings.create({
        commission: 50,
        totalRevenue: 0,
      });
    }

    if (resellerActivationFee !== undefined) {
      settings.resellerActivationFee = resellerActivationFee;
    }

    if (resellerWithdrawMin !== undefined) {
      settings.resellerWithdrawMin = resellerWithdrawMin;
    }

    if (platformDomain !== undefined) {
      settings.platformDomain = platformDomain;
    }

    if (supportWhatsapp !== undefined) {
      settings.supportWhatsapp = supportWhatsapp;
    }

    if (supportTelegram !== undefined) {
      settings.supportTelegram = supportTelegram;
    }

    if (supportWhatsappChannel !== undefined) {
      settings.supportWhatsappChannel = supportWhatsappChannel;
    }

    await settings.save();

    // 🔥 Log admin updating reseller settings
    await logAdminAction(
      req.user._id,
      "UPDATE_RESELLER_SETTINGS",
      "Updated reseller settings"
    );

    res.json({
      message: "Reseller settings updated successfully",
      resellerActivationFee: settings.resellerActivationFee,
      resellerWithdrawMin: settings.resellerWithdrawMin,
      platformDomain: settings.platformDomain,

      supportWhatsapp: settings.supportWhatsapp || "",
      supportTelegram: settings.supportTelegram || "",
      supportWhatsappChannel: settings.supportWhatsappChannel || "",
    });
  } catch (err) {
    console.error("Error updating reseller settings:", err);
    res.status(500).json({ message: "Failed to update reseller settings" });
  }
};

/**
 * POST /api/admin/settings/reset-revenue
 */
export const resetRevenue = async (req, res) => {
  try {
    let settings = await Settings.findOne();

    if (!settings) {
      settings = await Settings.create({
        commission: 50,
        totalRevenue: 0,
      });
    } else {
      settings.totalRevenue = 0;
      await settings.save();
    }

    // 🔥 Log admin resetting revenue
    await logAdminAction(
      req.user._id,
      "RESET_REVENUE",
      "Reset total revenue to 0"
    );

    res.json({
      message: "Revenue reset successfully",
      totalRevenue: settings.totalRevenue,
    });
  } catch (err) {
    console.error("Error resetting revenue:", err);
    res.status(500).json({ message: "Failed to reset revenue" });
  }
};
