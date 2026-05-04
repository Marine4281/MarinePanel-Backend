// controllers/cpOwnerServiceController.js
//
// Child panel owner — full control over their own service catalog.
// This mirrors adminServiceControllers.js but is scoped entirely
// to the CP owner (cpOwner field on Service documents).
//
// The CP owner can:
//   - List all their services (imported + manually added)
//   - Manually add a new service (no provider needed)
//   - Edit any service (name, category, platform, rate, min, max, description, status)
//   - Delete any service
//   - Bulk toggle / bulk delete
//   - Set their own commission rate (stored on their User doc)
//
// Commission flow for end users:
//   platform services → providerRate + adminCommission% + cpCommission%
//   own services      → service.rate + cpCommission%
//
// Routes mounted at /api/cp/services  (see cpOwnerServiceRoutes.js)

import Service from "../models/Service.js";
import Counter from "../models/Counter.js";
import User from "../models/User.js";

// ──────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────

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
// ──────────────────────────────────────────────
export const getCPServices = async (req, res) => {
  try {
    const services = await Service.find({ cpOwner: req.user._id })
      .sort({ createdAt: -1 })
      .lean();

    // Attach CP commission to each service for frontend display
    const user = await User.findById(req.user._id).select("childPanelCommissionRate").lean();
    const commission = Number(user?.childPanelCommissionRate ?? 0);

    const withFinal = services.map((s) => {
      const base = Number(s.rate || 0);
      const finalRate = base + (base * commission) / 100;
      return { ...s, cpCommission: commission, finalRate };
    });

    res.json(withFinal);
  } catch (err) {
    console.error("CP GET SERVICES ERROR:", err);
    res.status(500).json({ message: "Failed to fetch services" });
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
    } = req.body;

    if (!name || !category || !platform) {
      return res.status(400).json({ message: "name, category and platform are required" });
    }

    const serviceId = await getNextServiceId();
    const numericRate = Number(rate) || 0;

    // For manually-added CP services there is no external provider,
    // so we use sentinel values.
    const service = await Service.create({
      serviceId,
      name,
      category,
      platform,
      description: description || "",
      rate: numericRate,
      lastSyncedRate: numericRate,
      previousRate: numericRate,
      min: Number(min) || 1,
      max: Number(max) || 100000,
      status: true,
      isFree: false,
      freeQuantity: 0,
      cooldownHours: 0,
      refillAllowed: Boolean(refillAllowed ?? false),
      cancelAllowed: Boolean(cancelAllowed ?? false),
      refillPolicy: "none",
      customRefillDays: null,
      // Scope to this child panel; use placeholder provider values
      cpOwner: req.user._id,
      provider: "manual",
      providerServiceId: `manual-${serviceId}`,
      // providerProfileId is required by schema — use the user's own id as a sentinel
      // (schema accepts ObjectId, so we store the cpOwner's id as a dummy)
      providerProfileId: req.user._id,
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

    if (!service) {
      return res.status(404).json({ message: "Service not found" });
    }

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
    } = req.body;

    if (name !== undefined) service.name = name;
    if (category !== undefined) service.category = category;
    if (platform !== undefined) service.platform = platform;
    if (description !== undefined) service.description = description;
    if (status !== undefined) service.status = Boolean(status);
    if (refillAllowed !== undefined) service.refillAllowed = Boolean(refillAllowed);
    if (cancelAllowed !== undefined) service.cancelAllowed = Boolean(cancelAllowed);
    if (min !== undefined) service.min = Number(min);
    if (max !== undefined) service.max = Number(max);

    if (rate !== undefined && Number(rate) !== service.rate) {
      service.previousRate = service.rate;
      service.rate = Number(rate);
      service.lastSyncedRate = Number(rate);
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
    const service = await Service.findOne({
      _id: req.params.id,
      cpOwner: req.user._id,
    });

    if (!service) {
      return res.status(404).json({ message: "Service not found" });
    }

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
    const service = await Service.findOne({
      _id: req.params.id,
      cpOwner: req.user._id,
    });

    if (!service) {
      return res.status(404).json({ message: "Service not found" });
    }

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
    if (!ids || !ids.length) {
      return res.status(400).json({ message: "No ids provided" });
    }

    const services = await Service.find({
      _id: { $in: ids },
      cpOwner: req.user._id,
    });

    await Promise.all(
      services.map((s) => {
        s.status = !s.status;
        return s.save();
      })
    );

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
    if (!ids || !ids.length) {
      return res.status(400).json({ message: "No ids provided" });
    }

    const result = await Service.deleteMany({
      _id: { $in: ids },
      cpOwner: req.user._id,
    });

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
    const user = await User.findById(req.user._id)
      .select("childPanelCommissionRate")
      .lean();

    res.json({ commission: user?.childPanelCommissionRate ?? 0 });
  } catch (err) {
    console.error("CP GET COMMISSION ERROR:", err);
    res.status(500).json({ message: "Failed to fetch commission" });
  }
};

// ──────────────────────────────────────────────
// SET COMMISSION (CP owner sets their own markup %)
// PATCH /api/cp/services/commission
// ──────────────────────────────────────────────
export const setCPCommission = async (req, res) => {
  try {
    const { commission } = req.body;
    const rate = Number(commission);

    if (isNaN(rate) || rate < 0) {
      return res.status(400).json({ message: "Invalid commission rate" });
    }

    await User.findByIdAndUpdate(req.user._id, {
      childPanelCommissionRate: rate,
    });

    res.json({ message: "Commission updated", commission: rate });
  } catch (err) {
    console.error("CP SET COMMISSION ERROR:", err);
    res.status(500).json({ message: "Failed to update commission" });
  }
};
