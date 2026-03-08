// controllers/AdminService.js

import Service from "../models/Service.js";
import Counter from "../models/Counter.js"; // 🆕 Auto Increment Counter
import { clearCache } from "../utils/cache.js";

/* =========================================================
   AUTO INCREMENT SERVICE ID
========================================================= */
async function getNextServiceId() {
  const counter = await Counter.findOneAndUpdate(
    { id: "serviceId" },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  return counter.seq;
}

/* =========================================================
   GET ALL SERVICES (ADMIN)
========================================================= */
export const getAllServices = async (req, res) => {
  try {
    const services = await Service.find()
      .sort({ createdAt: -1 })
      .lean();

    res.json(services);
  } catch (err) {
    console.error("GET SERVICES ERROR:", err);
    res.status(500).json({
      message: "Failed to fetch services",
      error: err.message,
    });
  }
};

/* =========================================================
   ADD SERVICE
========================================================= */
export const addService = async (req, res) => {
  try {
    const {
      category,
      platform,
      name,
      provider,
      rate,
      min,
      max,
      isDefault,
      isDefaultCategoryGlobal,
      isDefaultCategoryPlatform,

      // FREE SETTINGS (matching frontend)
      isFree,
      freeQuantity,
      cooldownHours,
      
    } = req.body;

    if (!category || !platform || !name || !provider) {
      return res.status(400).json({
        message: "Missing required fields",
      });
    }

    let finalRate = rate || 0;
    let finalMin = min || 1;
    let finalMax = max || 100000;

    /* ================= FREE SERVICE ================= */
if (isFree) {
  if (
    freeQuantity === undefined ||
    cooldownHours === undefined
  ) {
    return res.status(400).json({
      message: "Free service requires max quantity and cooldown hours",
    });
  }

  finalRate = 0;
  finalMin = 1;
  finalMax = Number(freeQuantity);
}

    /* ================= DEFAULT RULES ================= */

    if (isDefault) {
      await Service.updateMany(
        { category },
        { $set: { isDefault: false } }
      );
    }

    if (isDefaultCategoryGlobal) {
      await Service.updateMany(
        {},
        { $set: { isDefaultCategoryGlobal: false } }
      );
    }

    if (isDefaultCategoryPlatform) {
      await Service.updateMany(
        { platform },
        { $set: { isDefaultCategoryPlatform: false } }
      );
    }

    /* 🆕 Generate Service ID */
    const serviceId = await getNextServiceId();

    const service = await Service.create({
      ...req.body,
      serviceId, // 🆕 Human readable ID
      rate: finalRate,
      min: finalMin,
      max: finalMax,

      isFree: Boolean(isFree),
      freeQuantity: isFree ? freeQuantity : 0,
      cooldownHours: isFree ? cooldownHours : 0,
      
    });

    // 🔥 Clear public cache so users see changes instantly
    clearCache("public_services");

    res.status(201).json(service);

  } catch (err) {
    console.error("ADD SERVICE ERROR:", err);
    res.status(500).json({
      message: "Failed to add service",
      error: err.message,
    });
  }
};

/* =========================================================
   UPDATE SERVICE
========================================================= */
export const updateService = async (req, res) => {
  try {
    const {
      category,
      platform,
      isDefault,
      isDefaultCategoryGlobal,
      isDefaultCategoryPlatform,
      isFree,
      freeQuantity,
      cooldownHours,
      
    } = req.body;

    const service = await Service.findById(req.params.id);
    if (!service) {
      return res.status(404).json({ message: "Service not found" });
    }

    /* ================= DEFAULT RULES ================= */

    if (isDefault) {
      await Service.updateMany(
        { category, _id: { $ne: req.params.id } },
        { $set: { isDefault: false } }
      );
    }

    if (isDefaultCategoryGlobal) {
      await Service.updateMany(
        { _id: { $ne: req.params.id } },
        { $set: { isDefaultCategoryGlobal: false } }
      );
    }

    if (isDefaultCategoryPlatform) {
      await Service.updateMany(
        { platform, _id: { $ne: req.params.id } },
        { $set: { isDefaultCategoryPlatform: false } }
      );
    }

    /* ================= FREE UPDATE ================= */

if (typeof isFree === "boolean") {
  service.isFree = isFree;

  if (isFree) {
    if (
      freeQuantity === undefined ||
      cooldownHours === undefined
    ) {
      return res.status(400).json({
        message: "Free service requires max quantity and cooldown hours",
      });
    }

    service.rate = 0;
    service.min = 1;
    service.max = Number(freeQuantity);
    service.freeQuantity = Number(freeQuantity);
    service.cooldownHours = Number(cooldownHours);
    
  } else {
    service.freeQuantity = 0;
    service.cooldownHours = 0;
  }
}

    // Update remaining fields safely
    Object.keys(req.body).forEach((key) => {
      if (![
        "isFree",
        "freeQuantity",
        "cooldownHours",
      ].includes(key)) {
        service[key] = req.body[key];
      }
    });

    await service.save();

    // 🔥 Clear public cache
    clearCache("public_services");

    res.json(service);

  } catch (err) {
    console.error("UPDATE SERVICE ERROR:", err);
    res.status(500).json({
      message: "Failed to update service",
      error: err.message,
    });
  }
};

/* =========================================================
   DELETE SERVICE
========================================================= */
export const deleteService = async (req, res) => {
  try {
    const deleted = await Service.findByIdAndDelete(req.params.id);

    if (!deleted) {
      return res.status(404).json({ message: "Service not found" });
    }

    // 🔥 Clear public cache
    clearCache("public_services");

    res.json({ message: "Service deleted" });

  } catch (err) {
    console.error("DELETE SERVICE ERROR:", err);
    res.status(500).json({
      message: "Failed to delete service",
      error: err.message,
    });
  }
};

/* =========================================================
   GET UNIQUE CATEGORIES
========================================================= */
export const getCategories = async (req, res) => {
  try {
    const categories = await Service.distinct("category");
    res.json(categories);
  } catch (err) {
    res.status(500).json({
      message: "Failed to fetch categories",
      error: err.message,
    });
  }
};

/* =========================================================
   GET UNIQUE PROVIDERS
========================================================= */
export const getProviders = async (req, res) => {
  try {
    const providers = await Service.distinct("provider");
    res.json(providers);
  } catch (err) {
    res.status(500).json({
      message: "Failed to fetch providers",
      error: err.message,
    });
  }
};

export const toggleServiceStatus = async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);

    if (!service) {
      return res.status(404).json({ message: "Service not found" });
    }

    service.status = !service.status;
    await service.save();

    res.json({
      message: `Service ${service.status ? "shown" : "hidden"} successfully`,
      status: service.status,
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to update status" });
  }
};
