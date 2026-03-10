// controllers/AdminService.js

import Service from "../models/Service.js";
import Counter from "../models/Counter.js";
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
IMPORT SERVICE FROM PROVIDER
========================================================= */
export const importService = async (req, res) => {
  try {
    const {
      name,
      category,
      description,
      rate,
      min,
      max,
      providerServiceId,
      providerApiUrl,
      providerApiKey,
      provider,
      platform
    } = req.body;

    if (!name || !category || !providerServiceId) {
      return res.status(400).json({
        message: "Missing required fields for import",
      });
    }

    // Prevent duplicate provider services
    const existing = await Service.findOne({
      providerServiceId,
      providerApiUrl,
    });

    if (existing) {
      return res.status(400).json({
        message: "Service already imported",
      });
    }

    const serviceId = await getNextServiceId();

    const service = await Service.create({
      serviceId,

      name,
      category,
      platform: platform || "General",

      description: description || "",

      rate: Number(rate) || 0,
      min: Number(min) || 1,
      max: Number(max) || 100000,

      provider: provider || "Custom Provider",

      providerServiceId,
      providerApiUrl,
      providerApiKey,

      status: true,

      isFree: false,
      freeQuantity: 0,
      cooldownHours: 0,
    });

    clearCache("public_services");

    res.status(201).json({
      message: "Service imported successfully",
      service,
    });

  } catch (err) {
    console.error("IMPORT SERVICE ERROR:", err);
    res.status(500).json({
      message: "Failed to import service",
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
      description,
      isDefault,
      isDefaultCategoryGlobal,
      isDefaultCategoryPlatform,

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

    const serviceId = await getNextServiceId();

    const service = await Service.create({
      ...req.body,
      serviceId,

      description: description || "",

      rate: finalRate,
      min: finalMin,
      max: finalMax,

      isFree: Boolean(isFree),
      freeQuantity: isFree ? freeQuantity : 0,
      cooldownHours: isFree ? cooldownHours : 0,
    });

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

/* =========================================================
TOGGLE SERVICE STATUS
========================================================= */
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
