// controllers/resellerServiceController.js
import Service from "../models/Service.js";
import User from "../models/User.js";
import ResellerService from "../models/ResellerService.js";
import Settings from "../models/Settings.js";

/* =========================================================
GET ALL SERVICES (Reseller/Admin/End User)
========================================================= */
export const getResellerServices = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    let resellerCommission = 0;
    let resellerId = null;

    if (user.isReseller) {
      resellerCommission = Number(user.resellerCommissionRate || 0);
      resellerId = user._id;
    } else if (user.resellerOwner) {
      const owner = await User.findById(user.resellerOwner);
      resellerCommission = Number(owner?.resellerCommissionRate || 0);
      resellerId = owner?._id || null;
    }

    const settings = await Settings.findOne();
    const adminCommission = Number(settings?.commission || 0);

    const services = await Service.find({ status: true })
      .select("name rate min max category platform visible serviceId isFree freeQuantity cooldownHours refillAllowed cancelAllowed serviceType isDefaultCategoryGlobal isDefaultCategoryPlatform description")
      .sort({ createdAt: -1 })
      .lean();

    let resellerOverrides = [];
    if (resellerId) {
      resellerOverrides = await ResellerService.find({ resellerId }).lean();
    }

    const overridesMap = {};
    resellerOverrides.forEach((r) => {
      overridesMap[r.serviceId.toString()] = r;
    });

    const formattedServices = services
      .map((s) => {
        const providerRate = Number(s.rate || 0);
        const systemRate = providerRate + (providerRate * adminCommission) / 100;
        const finalRate = systemRate + (systemRate * resellerCommission) / 100;

        const override = overridesMap[s._id.toString()];
        const visible = override?.visible ?? s.visible ?? true;

        // Apply reseller-level name/category overrides — never mutate the global service
        const name     = override?.customName     || s.name;
        const category = override?.customCategory || s.category || "General";

        return {
          _id: s._id,
          serviceId: s.serviceId || s._id,
          name,
          category,
          platform: s.platform || "General",
          visible,

          // Pricing
          providerRate,
          systemRate,
          resellerRate: finalRate,
          finalRate,
          rate: finalRate,

          min: Number(s.min ?? 1),
          max: Number(s.max ?? 100000),

          // Service meta
          serviceType:               s.serviceType  || "Default",
          description:               s.description  || "",
          isFree:                    s.isFree        || false,
          freeQuantity:              s.freeQuantity  || 0,
          cooldownHours:             s.cooldownHours || 0,
          refillAllowed:             s.refillAllowed || false,
          cancelAllowed:             s.cancelAllowed || false,
          isDefaultCategoryGlobal:   s.isDefaultCategoryGlobal   || false,
          isDefaultCategoryPlatform: s.isDefaultCategoryPlatform || false,
        };
      })
      .filter((s) => s.visible);

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

    if (!serviceId) return res.status(400).json({ message: "Service ID required" });

    const record = await ResellerService.findOneAndUpdate(
      { resellerId, serviceId },
      { visible },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({ message: "Visibility updated for reseller", record });
  } catch (error) {
    console.error("UPDATE RESELLER VISIBILITY ERROR:", error);
    res.status(500).json({ message: "Failed to update visibility" });
  }
};

/* =========================================================
UPDATE SERVICE NAME OR CATEGORY (RESELLER OVERRIDE ONLY)
========================================================= */
export const updateServiceName = async (req, res) => {
  try {
    const { serviceId, newName, newCategoryName } = req.body;
    const resellerId = req.user._id;

    if (!serviceId) return res.status(400).json({ message: "Service ID required" });

    // Verify the service exists globally
    const service = await Service.findById(serviceId);
    if (!service) return res.status(404).json({ message: "Service not found" });

    // Store the override on the reseller's ResellerService record only.
    // The global Service document is never mutated — this keeps the platform
    // service name intact for all other resellers and the main panel,
    // and prevents providerProfileId from becoming stale after a re-sync.
    const updateFields = {};
    if (newName)         updateFields.customName     = newName.trim();
    if (newCategoryName) updateFields.customCategory = newCategoryName.trim();

    const record = await ResellerService.findOneAndUpdate(
      { resellerId, serviceId },
      updateFields,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({ message: "Service override saved", record });
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

    if (isNaN(commissionNumber))
      return res.status(400).json({ message: "Commission must be a number" });

    if (commissionNumber < 0)
      return res.status(400).json({ message: "Commission cannot be negative" });

    const reseller = await User.findById(req.user._id);
    if (!reseller) return res.status(404).json({ message: "Reseller not found" });

    reseller.resellerCommissionRate = commissionNumber;
    await reseller.save();

    res.json({ message: "Commission updated", commission: commissionNumber });
  } catch (error) {
    console.error("SET RESELLER COMMISSION ERROR:", error);
    res.status(500).json({ message: "Failed to set commission" });
  }
};
