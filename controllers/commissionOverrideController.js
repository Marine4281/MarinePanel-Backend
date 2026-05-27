// controllers/commissionOverrideController.js
import Service from "../models/Service.js";
import Settings from "../models/Settings.js";
import { clearCache } from "../utils/cache.js";
import logAdminAction from "../utils/logAdminAction.js";

/* ══════════════════════════════════════════════════
   ADMIN — SET PER-SERVICE COMMISSION OVERRIDE
   PATCH /api/admin/services/:id/commission
══════════════════════════════════════════════════ */
export const setServiceCommission = async (req, res) => {
  try {
    const { commission } = req.body; // null to clear, number to set

    const service = await Service.findById(req.params.id);
    if (!service) return res.status(404).json({ message: "Service not found" });

    if (commission === null || commission === undefined || commission === "") {
      service.commissionOverride = null;
    } else {
      const val = Number(commission);
      if (isNaN(val) || val < 0)
        return res.status(400).json({ message: "Invalid commission value" });
      service.commissionOverride = val;
    }

    await service.save();
    clearCache("public_services");

    await logAdminAction(
      req.user._id,
      "SET_SERVICE_COMMISSION",
      `Set commission override ${service.commissionOverride ?? "cleared"} on service ${service.name}`
    );

    res.json({
      message: "Service commission updated",
      commissionOverride: service.commissionOverride,
    });
  } catch (err) {
    console.error("SET_SERVICE_COMMISSION ERROR:", err);
    res.status(500).json({ message: "Failed to update commission", error: err.message });
  }
};

/* ══════════════════════════════════════════════════
   ADMIN — GET / SET PER-CATEGORY COMMISSION
   GET    /api/admin/services/category-commissions
   PATCH  /api/admin/services/category-commissions
══════════════════════════════════════════════════ */
export const getCategoryCommissions = async (req, res) => {
  try {
    const settings = await Settings.findOne().lean();
    const raw = settings?.categoryCommissions || {};
    // Convert Map (mongoose) or plain object to plain object
    const commissions = raw instanceof Map ? Object.fromEntries(raw) : raw;
    res.json({ categoryCommissions: commissions });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch category commissions" });
  }
};

export const setCategoryCommission = async (req, res) => {
  try {
    const { category, commission } = req.body; // commission: null to clear

    if (!category)
      return res.status(400).json({ message: "Category is required" });

    let settings = await Settings.findOne();
    if (!settings) settings = await Settings.create({});

    // Get current map
    const map = settings.categoryCommissions
      ? Object.fromEntries(settings.categoryCommissions)
      : {};

    if (commission === null || commission === undefined || commission === "") {
      delete map[category];
    } else {
      const val = Number(commission);
      if (isNaN(val) || val < 0)
        return res.status(400).json({ message: "Invalid commission value" });
      map[category] = val;
    }

    settings.categoryCommissions = map;
    await settings.save();
    clearCache("public_services");

    await logAdminAction(
      req.user._id,
      "SET_CATEGORY_COMMISSION",
      `Set category commission for "${category}" → ${commission ?? "cleared"}`
    );

    res.json({
      message: "Category commission updated",
      category,
      commission: map[category] ?? null,
    });
  } catch (err) {
    console.error("SET_CATEGORY_COMMISSION ERROR:", err);
    res.status(500).json({ message: "Failed to update category commission", error: err.message });
  }
};

/* ══════════════════════════════════════════════════
   CP OWNER — SET PER-SERVICE COMMISSION OVERRIDE
   PATCH /api/cp/services/:id/commission
══════════════════════════════════════════════════ */
export const setCPServiceCommission = async (req, res) => {
  try {
    const { commission } = req.body;

    const service = await Service.findOne({
      _id: req.params.id,
      cpOwner: req.user._id,
    });

    if (!service)
      return res.status(404).json({ message: "Service not found" });

    if (commission === null || commission === undefined || commission === "") {
      service.commissionOverride = null;
    } else {
      const val = Number(commission);
      if (isNaN(val) || val < 0)
        return res.status(400).json({ message: "Invalid commission value" });
      service.commissionOverride = val;
    }

    await service.save();

    res.json({
      message: "Service commission updated",
      commissionOverride: service.commissionOverride,
    });
  } catch (err) {
    console.error("SET_CP_SERVICE_COMMISSION ERROR:", err);
    res.status(500).json({ message: "Failed to update commission", error: err.message });
  }
};

/* ══════════════════════════════════════════════════
   CP OWNER — GET / SET CATEGORY COMMISSION
   (Stored on the CP user's own settings map)
   GET   /api/cp/services/category-commissions
   PATCH /api/cp/services/category-commissions
══════════════════════════════════════════════════ */
import User from "../models/User.js";

export const getCPCategoryCommissions = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select("categoryCommissions")
      .lean();
    const raw = user?.categoryCommissions || {};
    const commissions = raw instanceof Map ? Object.fromEntries(raw) : raw;
    res.json({ categoryCommissions: commissions });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch category commissions" });
  }
};

export const setCPCategoryCommission = async (req, res) => {
  try {
    const { category, commission } = req.body;
    if (!category)
      return res.status(400).json({ message: "Category is required" });

    const user = await User.findById(req.user._id);
    const map = user.categoryCommissions
      ? Object.fromEntries(user.categoryCommissions)
      : {};

    if (commission === null || commission === undefined || commission === "") {
      delete map[category];
    } else {
      const val = Number(commission);
      if (isNaN(val) || val < 0)
        return res.status(400).json({ message: "Invalid commission value" });
      map[category] = val;
    }

    user.categoryCommissions = map;
    await user.save();

    res.json({
      message: "Category commission updated",
      category,
      commission: map[category] ?? null,
    });
  } catch (err) {
    console.error("SET_CP_CATEGORY_COMMISSION ERROR:", err);
    res.status(500).json({ message: "Failed to update", error: err.message });
  }
};
