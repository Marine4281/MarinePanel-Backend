// controllers/AdminService.js

import Service from "../models/Service.js";
import Counter from "../models/Counter.js";
import ProviderProfile from "../models/ProviderProfile.js";
import { clearCache } from "../utils/cache.js";
import logAdminAction from "../utils/logAdminAction.js";

/* =========================================================
AUTO INCREMENT SERVICE ID
========================================================= */
async function getNextServiceId() {
  // 1️⃣ Get highest serviceId in DB
  const lastService = await Service.findOne().sort({ serviceId: -1 });
  const maxId = lastService ? lastService.serviceId : 1000;

  // 2️⃣ Ensure counter is not behind
  await Counter.findOneAndUpdate(
    { _id: "serviceId" },
    { $max: { seq: maxId } },
    { upsert: true }
  );

  // 3️⃣ Now safely increment
  const counter = await Counter.findOneAndUpdate(
    { _id: "serviceId" },
    { $inc: { seq: 1 } },
    { new: true }
  );

  return counter.seq;
}
/* =========================================================
GET ALL SERVICES (ADMIN)
========================================================= */
export const getAllServices = async (req, res) => {
  try {
    const services = await Service.find()
      .populate("providerProfileId", "name apiUrl")
      .sort({ createdAt: -1 })
      .lean();

    await logAdminAction(
      req.user._id,
      "VIEW_SERVICES",
      "Viewed all services"
    );

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
IMPORT SERVICE FROM PROVIDER (UPDATED 🔥)
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
      providerProfileId,
      platform,
      refillAllowed,
      cancelAllowed,
    } = req.body;

    if (!name || !category || !providerServiceId || !providerProfileId) {
      return res.status(400).json({
        message: "Missing required fields",
      });
    }

    // Get provider info
    const providerProfile = await ProviderProfile.findById(providerProfileId);

    if (!providerProfile) {
      return res.status(404).json({
        message: "Provider not found",
      });
    }

    // 🔥 Check duplicate (NEW LOGIC)
    const existing = await Service.findOne({
      providerServiceId,
      providerProfileId,
    });

    if (existing) {
      return res.status(400).json({
        message: "Service already imported",
      });
    }

    const serviceId = await getNextServiceId();

    const numericRate = Number(rate) || 0;

    const service = await Service.create({
      serviceId,
      name,
      category,
      platform: platform || "General",
      description: description || "",
      rate: numericRate,

      // 🔥 sync tracking
      lastSyncedRate: numericRate,
      previousRate: numericRate,

      min: Number(min) || 1,
      max: Number(max) || 100000,

      provider: providerProfile.name,
      providerProfileId,
      providerServiceId,

      status: true,
      isFree: false,
      freeQuantity: 0,
      cooldownHours: 0,

      //Refill and Cancel
      refillAllowed: 
Boolean(refillAllowed ?? false),
      cancelAllowed: 
Boolean(cancelAllowed ?? false),

      refillPolicy: "none",
      customRefillDays: null,
    });

    clearCache("public_services");

    await logAdminAction(
      req.user._id,
      "IMPORT_SERVICE",
      `Imported service ${service.name}`
    );

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
ADD SERVICE (MANUAL)
========================================================= */
export const addService = async (req, res) => {
  try {
    const {
      category,
      platform,
      name,
      providerProfileId,
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
      refillAllowed,   // ✅ ADD
      cancelAllowed,
    } = req.body;

    if (!category || !platform || !name || !providerProfileId) {
      return res.status(400).json({
        message: "Missing required fields",
      });
    }

    const providerProfile = await ProviderProfile.findById(providerProfileId);

    if (!providerProfile) {
      return res.status(404).json({
        message: "Provider not found",
      });
    }

    let finalRate = rate || 0;
    let finalMin = min || 1;
    let finalMax = max || 100000;

    if (isFree) {
      if (freeQuantity === undefined || cooldownHours === undefined) {
        return res.status(400).json({
          message: "Free service requires max quantity and cooldown hours",
        });
      }

      finalRate = 0;
      finalMin = 1;
      finalMax = Number(freeQuantity);
    }

    if (isDefault) {
      await Service.updateMany({ category }, { $set: { isDefault: false } });
    }

    if (isDefaultCategoryGlobal) {
      await Service.updateMany({}, { $set: { isDefaultCategoryGlobal: false } });
    }

    if (isDefaultCategoryPlatform) {
      await Service.updateMany(
        { platform },
        { $set: { isDefaultCategoryPlatform: false } }
      );
    }

    const serviceId = await getNextServiceId();

    const numericRate = Number(finalRate);

    const service = await Service.create({
      ...req.body,
      serviceId,

      provider: providerProfile.name,
      providerProfileId,

      rate: numericRate,
      lastSyncedRate: numericRate,
      previousRate: numericRate,

      min: finalMin,
      max: finalMax,

      description: description || "",
      isFree: Boolean(isFree),
      freeQuantity: isFree ? freeQuantity : 0,
      cooldownHours: isFree ? cooldownHours : 0,

      refillAllowed: Boolean(refillAllowed ?? false),
      cancelAllowed: Boolean(cancelAllowed ?? false),

      refillPolicy: "none",
      customRefillDays: null,
    });

    clearCache("public_services");

    await logAdminAction(
      req.user._id,
      "ADD_SERVICE",
      `Added service ${service.name}`
    );

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
      rate,
      refillAllowed,   // ✅ ADD
      cancelAllowed,
    } = req.body;

    const service = await Service.findById(req.params.id);

    if (!service) {
      return res.status(404).json({ message: "Service not found" });
    }

    /* =========================================================
    🛠 FIX 1: Ensure providerProfileId exists (prevents crash)
    ========================================================= */
    if (!service.providerProfileId) {
      const provider = await ProviderProfile.findOne({
        name: service.provider,
      });

      if (provider) {
        service.providerProfileId = provider._id;
      } else {
        return res.status(400).json({
          message:
            "Service is missing providerProfileId and cannot be auto-fixed",
        });
      }
    }

    /* =========================================================
    💰 RATE TRACKING
    ========================================================= */
    if (rate !== undefined && Number(rate) !== service.rate) {
      service.previousRate = service.rate;
      service.rate = Number(rate);

      // 🔥 keep sync clean
      service.lastSyncedRate = Number(rate);
    }

    /* =========================================================
    ⭐ DEFAULT FLAGS
    ========================================================= */
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

    /* =========================================================
    🎁 FREE SERVICE LOGIC
    ========================================================= */
    if (typeof isFree === "boolean") {
      service.isFree = isFree;

      if (isFree) {
        if (freeQuantity === undefined || cooldownHours === undefined) {
          return res.status(400).json({
            message:
              "Free service requires max quantity and cooldown hours",
          });
        }

        service.previousRate = service.rate;
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

    /* =========================================================
    🧠 APPLY OTHER FIELDS SAFELY
    ========================================================= */
    for (const key of Object.keys(req.body)) {
  if (
    req.body[key] !== undefined &&
    !["isFree", "freeQuantity", "refillAllowed", "cancelAllowed", "refillPolicy", "customRefillDays", "cooldownHours"].includes(key)
  ) {
    service[key] = req.body[key];
  }
    }

    // override safety
    if (refillAllowed !== undefined) {
  service.refillAllowed = Boolean(refillAllowed);
}

if (cancelAllowed !== undefined) {
  service.cancelAllowed = Boolean(cancelAllowed);
}

// ✅ APPLY REFILL POLICY (FIX)
if (req.body.refillPolicy !== undefined) {
  service.refillPolicy = req.body.refillPolicy;
}

if (req.body.customRefillDays !== undefined) {
  service.customRefillDays = req.body.customRefillDays;
}

// ✅ safety cleanup
if (!service.refillAllowed) {
  service.refillPolicy = "none";
  service.customRefillDays = null;
}

    /* =========================================================
    💾 SAVE (NOW SAFE)
    ========================================================= */
    await service.save();

    clearCache("public_services");

    await logAdminAction(
      req.user._id,
      "UPDATE_SERVICE",
      `Updated service ${service.name}`
    );

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

    await logAdminAction(
      req.user._id,
      "DELETE_SERVICE",
      `Deleted service ${deleted.name}`
    );

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

    await logAdminAction(
      req.user._id,
      "TOGGLE_SERVICE",
      `Toggled service ${service.name}`
    );

    res.json({
      message: `Service ${service.status ? "shown" : "hidden"} successfully`,
      status: service.status,
    });

  } catch (error) {
    res.status(500).json({ message: "Failed to update status" });
  }
};
