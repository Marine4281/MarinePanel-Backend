import Service from "../models/Service.js";
import User from "../models/User.js";
import ResellerService from "../models/ResellerService.js";

/* =========================================================
GET ALL SERVICES FOR RESELLER
========================================================= */
export const getResellerServices = async (req, res) => {
try {
const reseller = await User.findById(req.user._id);
const resellerCommission = Number(reseller?.resellerCommissionRate || 0);

// Fetch only active services
const services = await Service.find({ status: true }).lean();

// Fetch reseller visibility overrides
const resellerOverrides = await ResellerService.find({
  resellerId: reseller._id,
}).lean();

const overridesMap = {};
resellerOverrides.forEach((r) => {
  overridesMap[r.serviceId.toString()] = r;
});

const formattedServices = services.map((s) => {
  // Admin commission included in normal rate
  const adminCommission = Number(s.commission || 0);  // e.g., 10% admin fee
  const providerRate = Number(s.rate || 0);           // raw provider rate

  // Normal rate = provider rate + admin commission
  const normalRate = providerRate * (1 + adminCommission / 100);

  // Reseller rate = normal rate + reseller commission
  const resellerRate = normalRate * (1 + resellerCommission / 100);

  // Visibility override
  const override = overridesMap[s._id.toString()];
  const visible = override ? override.visible : s.visible ?? true;

  return {
    _id: s._id,
    serviceId: s.serviceId || s._id,
    name: s.name,
    category: s.category || "General",
    visible,

    // Normal system rate all users see
    systemRate: normalRate,

    // Reseller selling price
    resellerRate,

    min: Number(s.min ?? 1),
    max: Number(s.max ?? 100000),
  };
});
res.json({
  services: formattedServices,
  commission: resellerCommission,
});

} catch (error) {
console.error("GET RESELLER SERVICES ERROR:", error);
res.status(500).json({ message: "Failed to fetch services" });
}
};

/* =========================================================
UPDATE SERVICE VISIBILITY (PER RESELLER)
========================================================= */
export const updateServiceVisibility = async (req, res) => {
try {
const { serviceId, visible } = req.body;
const resellerId = req.user._id;

const record = await ResellerService.findOneAndUpdate(
  { resellerId, serviceId },
  { visible },
  { upsert: true, new: true }
);

res.json({
  message: "Visibility updated for reseller",
  record,
});

} catch (error) {
console.error("UPDATE RESELLER VISIBILITY ERROR:", error);
res.status(500).json({ message: "Failed to update visibility" });
}
};

/* =========================================================
UPDATE SERVICE NAME OR CATEGORY (GLOBAL)
========================================================= */
export const updateServiceName = async (req, res) => {
try {
const { serviceId, newName, newCategoryName } = req.body;

if (!serviceId) {
  return res.status(400).json({ message: "Service ID required" });
}

const service = await Service.findById(serviceId);

if (!service) {
  return res.status(404).json({ message: "Service not found" });
}

if (newName) service.name = newName;
if (newCategoryName) service.category = newCategoryName;

await service.save();

res.json({
  message: "Service updated",
  service,
});

} catch (error) {
console.error("UPDATE SERVICE ERROR:", error);
res.status(500).json({ message: "Failed to update service" });
}
};

/* =========================================================
SET RESELLER COMMISSION
========================================================= */
export const setResellerCommission = async (req, res) => {
try {
const commissionNumber = Number(req.body.commission);

if (commissionNumber < 0) {
  return res.status(400).json({
    message: "Commission cannot be negative",
  });
}

const reseller = await User.findById(req.user._id);

if (!reseller) {
  return res.status(404).json({ message: "Reseller not found" });
}

reseller.resellerCommissionRate = commissionNumber;

await reseller.save();

res.json({
  message: "Commission updated",
  commission: commissionNumber,
});

} catch (error) {
console.error("SET RESELLER COMMISSION ERROR:", error);
res.status(500).json({ message: "Failed to set commission" });
}
};
