// controllers/cpOwnerServiceController.js
//
// Child panel owner — full control over their own service catalog.
//
// Service storage: Service model with cpOwner = req.user._id
//   - Imported from own providers (via cpOwnerProviderController)
//   - Manually added (this controller)
//
// Commission: childPanelCommissionRate on User doc — applied on top of
//   service.rate when end users fetch /api/services on CP domain.
//
// Default service system mirrors main admin:
//   isDefault                → default in its category
//   isDefaultCategoryGlobal  → default across ALL categories
//   isDefaultCategoryPlatform → default in its platform

import Service from "../models/Service.js";
import Counter from "../models/Counter.js";
import User from "../models/User.js";
import Settings from "../models/Settings.js";

// ── Auto-increment service ID ──
async function getNextServiceId() {
  const last = await Service.findOne().sort({ serviceId: -1 }).lean();
  const maxId = last ? last.serviceId : 1000;
  await Counter.findOneAndUpdate(
    { _id: "serviceId" },
    { $max: { seq: maxId } },
    { upsert: true }
  );
  const counter = await Counter.findOneAndUpdate(
    { _id: "serviceId" },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return counter.seq;
}

// ──────────────────────────────────────────────
// GET ALL CP SERVICES
// GET /api/cp/services
// Returns services sorted newest first.
// Also attaches admin commission so frontend can show
// "platform rate" for services imported from main panel.
// ──────────────────────────────────────────────
export const getCPServices = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select("childPanelCommissionRate")
      .lean();
    const commission = Number(user?.childPanelCommissionRate ?? 0);

    // Fetch admin commission so CP table can show the correct "cost" for
    // platform-imported services (admin rate + admin commission = what CP pays)
    const settings = await Settings.findOne().lean();
    const adminCommission = Number(settings?.commission ?? 0);

    const services = await Service.find({ cpOwner: req.user._id })
      .sort({ createdAt: -1 })   // newest first
      .lean();

    const withFinal = services.map((s) => {
      const costRate  = Number(s.rate || 0);
      // For platform-sourced services, costRate already reflects raw provider
      // rate. The admin commission was applied at import time OR we show it here.
      // Either way, the CP commission goes on top of whatever rate is stored.
      const finalRate = costRate + (costRate * commission) / 100;
      return {
        ...s,
        cpCommission: commission,
        adminCommission,
        finalRate,
      };
    });

    res.json(withFinal);
  } catch (err) {
    console.error("CP GET SERVICES ERROR:", err);
    res.status(500).json({ message: "Failed to fetch services" });
  }
};

// ──────────────────────────────────────────────
// GET PLATFORM SERVICES (for import tab preview)
// GET /api/cp/services/platform
// Returns main admin services with admin commission applied,
// so CP owner sees the actual cost they'd be paying per service.
// ──────────────────────────────────────────────
export const getCPPlatformServices = async (req, res) => {
  try {
    const settings = await Settings.findOne().lean();
    const adminCommission = Number(settings?.commission ?? 0);

    const services = await Service.find({
      status: true,
      availableToChildPanels: true,
      cpOwner: null,
    })
      .sort({ category: 1, name: 1 })
      .lean();

    const priced = services.map((s) => {
      const providerRate = Number(s.rate || 0);
      const systemRate   = providerRate + (providerRate * adminCommission) / 100;
      return {
        ...s,
        providerRate,
        systemRate,
        // 'rate' shown to CP owner = what they "pay" (system rate after admin commission)
        rate: systemRate,
        adminCommission,
      };
    });

    res.json(priced);
  } catch (err) {
    console.error("CP GET PLATFORM SERVICES ERROR:", err);
    res.status(500).json({ message: "Failed to fetch platform services" });
  }
};

// ──────────────────────────────────────────────
// ADD SERVICE MANUALLY
// POST /api/cp/services
// ──────────────────────────────────────────────
export const addCPService = async (req, res) => {
  try {
    const {
      name,
      category,
      platform,
      rate,
      min,
      max,
      description,
      refillAllowed,
      cancelAllowed,
      refillPolicy,
      customRefillDays,
      isFree,
      freeQuantity,
      cooldownHours,
      isDefault,
      isDefaultCategoryGlobal,
      isDefaultCategoryPlatform,
    } = req.body;

    if (!name || !category || !platform) {
      return res.status(400).json({ message: "name, category and platform are required" });
    }

    // Free service validation
    if (isFree && (freeQuantity === undefined || cooldownHours === undefined)) {
      return res.status(400).json({ message: "Free service requires freeQuantity and cooldownHours" });
    }

    let finalRate = isFree ? 0 : (Number(rate) || 0);
    let finalMin  = isFree ? 1 : (Number(min) || 1);
    let finalMax  = isFree ? Number(freeQuantity) : (Number(max) || 100000);

    // Handle defaults — scoped to this CP owner
    if (isDefault) {
      await Service.updateMany(
        { category, cpOwner: req.user._id },
        { $set: { isDefault: false } }
      );
    }
    if (isDefaultCategoryGlobal) {
      await Service.updateMany(
        { cpOwner: req.user._id },
        { $set: { isDefaultCategoryGlobal: false } }
      );
    }
    if (isDefaultCategoryPlatform) {
      await Service.updateMany(
        { platform, cpOwner: req.user._id },
        { $set: { isDefaultCategoryPlatform: false } }
      );
    }

    const serviceId  = await getNextServiceId();
    const numericRate = finalRate;

    const service = await Service.create({
      serviceId,
      name,
      category,
      platform,
      description:  description || "",
      rate:         numericRate,
      lastSyncedRate: numericRate,
      previousRate:   numericRate,
      min:  finalMin,
      max:  finalMax,
      status: true,
      isFree:       Boolean(isFree),
      freeQuantity: isFree ? Number(freeQuantity) : 0,
      cooldownHours: isFree ? Number(cooldownHours) : 0,
      refillAllowed: Boolean(refillAllowed ?? false),
      cancelAllowed: Boolean(cancelAllowed ?? false),
      refillPolicy:    refillAllowed ? (refillPolicy || "30d") : "none",
      customRefillDays: refillPolicy === "custom" ? Number(customRefillDays) : null,
      isDefault:                Boolean(isDefault),
      isDefaultCategoryGlobal:  Boolean(isDefaultCategoryGlobal),
      isDefaultCategoryPlatform: Boolean(isDefaultCategoryPlatform),
      // Scoped to this CP — no external provider
      cpOwner:           req.user._id,
      provider:          "manual",
      providerServiceId: `manual-${serviceId}`,
      providerProfileId: req.user._id, // sentinel — required by schema
    });

    res.status(201).json({ message: "Service created", service });
  } catch (err) {
    console.error("CP ADD SERVICE ERROR:", err);
    res.status(500).json({ message: "Failed to create service" });
  }
};

// ──────────────────────────────────────────────
// UPDATE SERVICE
// PUT /api/cp/services/:id
// ──────────────────────────────────────────────
export const updateCPService = async (req, res) => {
  try {
    const service = await Service.findOne({
      _id: req.params.id,
      cpOwner: req.user._id,
    });

    if (!service) return res.status(404).json({ message: "Service not found" });

    const {
      name,
      category,
      platform,
      rate,
      min,
      max,
      description,
      status,
      refillAllowed,
      cancelAllowed,
      refillPolicy,
      customRefillDays,
      isFree,
      freeQuantity,
      cooldownHours,
      isDefault,
      isDefaultCategoryGlobal,
      isDefaultCategoryPlatform,
    } = req.body;

    if (name !== undefined)        service.name        = name;
    if (category !== undefined)    service.category    = category;
    if (platform !== undefined)    service.platform    = platform;
    if (description !== undefined) service.description = description;
    if (status !== undefined)      service.status      = Boolean(status);
    if (min !== undefined)         service.min         = Number(min);
    if (max !== undefined)         service.max         = Number(max);

    // Free service
    if (isFree !== undefined) {
      service.isFree = Boolean(isFree);
      if (service.isFree) {
        service.rate         = 0;
        service.freeQuantity = Number(freeQuantity) || service.freeQuantity;
        service.cooldownHours = Number(cooldownHours) || service.cooldownHours;
        service.max          = service.freeQuantity;
      } else {
        service.freeQuantity  = 0;
        service.cooldownHours = 0;
      }
    }
    if (!service.isFree && freeQuantity !== undefined) service.freeQuantity  = Number(freeQuantity);
    if (!service.isFree && cooldownHours !== undefined) service.cooldownHours = Number(cooldownHours);

    // Rate
    if (!service.isFree && rate !== undefined && Number(rate) !== service.rate) {
      service.previousRate   = service.rate;
      service.rate           = Number(rate);
      service.lastSyncedRate = Number(rate);
    }

    // Refill
    if (refillAllowed !== undefined) service.refillAllowed = Boolean(refillAllowed);
    if (service.refillAllowed) {
      if (refillPolicy !== undefined)    service.refillPolicy    = refillPolicy;
      if (customRefillDays !== undefined) service.customRefillDays = Number(customRefillDays);
    } else {
      service.refillPolicy    = "none";
      service.customRefillDays = null;
    }

    if (cancelAllowed !== undefined) service.cancelAllowed = Boolean(cancelAllowed);

    // Defaults (scoped)
    if (isDefault) {
      await Service.updateMany(
        { category: service.category, cpOwner: req.user._id, _id: { $ne: service._id } },
        { $set: { isDefault: false } }
      );
      service.isDefault = true;
    } else if (isDefault === false) {
      service.isDefault = false;
    }

    if (isDefaultCategoryGlobal) {
      await Service.updateMany(
        { cpOwner: req.user._id, _id: { $ne: service._id } },
        { $set: { isDefaultCategoryGlobal: false } }
      );
      service.isDefaultCategoryGlobal = true;
    } else if (isDefaultCategoryGlobal === false) {
      service.isDefaultCategoryGlobal = false;
    }

    if (isDefaultCategoryPlatform) {
      await Service.updateMany(
        { platform: service.platform, cpOwner: req.user._id, _id: { $ne: service._id } },
        { $set: { isDefaultCategoryPlatform: false } }
      );
      service.isDefaultCategoryPlatform = true;
    } else if (isDefaultCategoryPlatform === false) {
      service.isDefaultCategoryPlatform = false;
    }

    await service.save();
    res.json({ message: "Service updated", service });
  } catch (err) {
    console.error("CP UPDATE SERVICE ERROR:", err);
    res.status(500).json({ message: "Failed to update service" });
  }
};

// ──────────────────────────────────────────────
// DELETE SERVICE
// DELETE /api/cp/services/:id
// ──────────────────────────────────────────────
export const deleteCPService = async (req, res) => {
  try {
    const service = await Service.findOne({ _id: req.params.id, cpOwner: req.user._id });
    if (!service) return res.status(404).json({ message: "Service not found" });
    await service.deleteOne();
    res.json({ message: "Service deleted" });
  } catch (err) {
    console.error("CP DELETE SERVICE ERROR:", err);
    res.status(500).json({ message: "Failed to delete service" });
  }
};

// ──────────────────────────────────────────────
// TOGGLE SERVICE STATUS
// PATCH /api/cp/services/:id/toggle
// ──────────────────────────────────────────────
export const toggleCPServiceStatus = async (req, res) => {
  try {
    const service = await Service.findOne({ _id: req.params.id, cpOwner: req.user._id });
    if (!service) return res.status(404).json({ message: "Service not found" });
    service.status = !service.status;
    await service.save();
    res.json({ message: "Status toggled", status: service.status });
  } catch (err) {
    console.error("CP TOGGLE SERVICE ERROR:", err);
    res.status(500).json({ message: "Failed to toggle status" });
  }
};

// ──────────────────────────────────────────────
// BULK TOGGLE
// PATCH /api/cp/services/bulk-toggle
// ──────────────────────────────────────────────
export const bulkToggleCPServices = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids?.length) return res.status(400).json({ message: "No ids provided" });
    const services = await Service.find({ _id: { $in: ids }, cpOwner: req.user._id });
    await Promise.all(services.map((s) => { s.status = !s.status; return s.save(); }));
    res.json({ message: "Toggled", count: services.length });
  } catch (err) {
    console.error("CP BULK TOGGLE ERROR:", err);
    res.status(500).json({ message: "Failed to bulk toggle" });
  }
};

// ──────────────────────────────────────────────
// BULK DELETE
// DELETE /api/cp/services/bulk
// ──────────────────────────────────────────────
export const bulkDeleteCPServices = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids?.length) return res.status(400).json({ message: "No ids provided" });
    const result = await Service.deleteMany({ _id: { $in: ids }, cpOwner: req.user._id });
    res.json({ message: "Deleted", count: result.deletedCount });
  } catch (err) {
    console.error("CP BULK DELETE ERROR:", err);
    res.status(500).json({ message: "Failed to bulk delete" });
  }
};

// ──────────────────────────────────────────────
// GET COMMISSION
// GET /api/cp/services/commission
// ──────────────────────────────────────────────
export const getCPCommission = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("childPanelCommissionRate").lean();
    res.json({ commission: user?.childPanelCommissionRate ?? 0 });
  } catch (err) {
    console.error("CP GET COMMISSION ERROR:", err);
    res.status(500).json({ message: "Failed to fetch commission" });
  }
};

// ──────────────────────────────────────────────
// SET COMMISSION
// PATCH /api/cp/services/commission
// ──────────────────────────────────────────────
export const setCPCommission = async (req, res) => {
  try {
    const { commission } = req.body;
    const rate = Number(commission);
    if (isNaN(rate) || rate < 0) return res.status(400).json({ message: "Invalid commission rate" });
    await User.findByIdAndUpdate(req.user._id, { childPanelCommissionRate: rate });
    res.json({ message: "Commission updated", commission: rate });
  } catch (err) {
    console.error("CP SET COMMISSION ERROR:", err);
    res.status(500).json({ message: "Failed to update commission" });
  }
};
