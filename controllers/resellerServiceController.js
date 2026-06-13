// controllers/resellerServiceController.js
import Service from "../models/Service.js";
import User from "../models/User.js";
import ResellerService from "../models/ResellerService.js";
import Settings from "../models/Settings.js";
import { CPService } from "../models/CPService.js"; // your CP-specific service model if applicable

/* =========================================================
GET ALL SERVICES (Reseller/Admin/End User)
CP-aware: if the reseller belongs to a child panel, only
services visible on that CP are returned.
========================================================= */
export const getResellerServices = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    let resellerCommission = 0;
    let resellerId = null;
    let cpOwnerId = null;

    if (user.isReseller) {
      resellerCommission = Number(user.resellerCommissionRate || 0);
      resellerId = user._id;
      cpOwnerId = user.childPanelOwner || null;
    } else if (user.resellerOwner) {
      const owner = await User.findById(user.resellerOwner);
      resellerCommission = Number(owner?.resellerCommissionRate || 0);
      resellerId = owner?._id || null;
      cpOwnerId = owner?.childPanelOwner || null;
    }

    const settings = await Settings.findOne();
    const adminCommission = Number(settings?.commission || 0);

    // ── Build base service query ────────────────────────────────────
    // If this reseller belongs to a CP, scope to the CP's service mode
    let services = [];

    if (cpOwnerId) {
      const cpOwner = await User.findById(cpOwnerId).lean();
      const serviceMode = cpOwner?.childPanelServiceMode || "none";

      if (serviceMode === "none") {
        // CP hasn't configured services yet — return empty
        return res.json({ services: [], commission: resellerCommission });
      }

      if (serviceMode === "platform" || serviceMode === "both") {
        // Platform services visible to this CP
        const platformServices = await Service.find({ status: true })
          .select("name rate min max category platform visible serviceId isFree freeQuantity cooldownHours refillAllowed cancelAllowed serviceType description commissionOverride")
          .sort({ createdAt: -1 })
          .lean();
        services.push(...platformServices);
      }

      if (serviceMode === "own" || serviceMode === "both") {
        // CP's own provider services (cpOwner field on Service)
        const ownServices = await Service.find({
          status: true,
          cpOwner: cpOwnerId,
        })
          .select("name rate min max category platform visible serviceId isFree freeQuantity cooldownHours refillAllowed cancelAllowed serviceType description cpOwner")
          .sort({ createdAt: -1 })
          .lean();
        services.push(...ownServices);
      }

      // Deduplicate by _id string
      const seen = new Set();
      services = services.filter((s) => {
        const key = s._id.toString();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    } else {
      // Main platform reseller — all platform services
      services = await Service.find({ status: true })
        .select("name rate min max category platform visible serviceId isFree freeQuantity cooldownHours refillAllowed cancelAllowed serviceType isDefaultCategoryGlobal isDefaultCategoryPlatform description commissionOverride")
        .sort({ createdAt: -1 })
        .lean();
    }

    // ── Reseller-level overrides ────────────────────────────────────
    let resellerOverrides = [];
    if (resellerId) {
      resellerOverrides = await ResellerService.find({ resellerId }).lean();
    }

    const overridesMap = {};
    resellerOverrides.forEach((r) => {
      overridesMap[r.serviceId.toString()] = r;
    });

    // ── Format + price each service ─────────────────────────────────
    const formattedServices = services
      .map((s) => {
        const providerRate = Number(s.rate || 0);

        let adminRate = adminCommission;
        if (s.commissionOverride != null) {
          adminRate = Number(s.commissionOverride);
        }

        const systemRate = providerRate + (providerRate * adminRate) / 100;
        const finalRate = systemRate + (systemRate * resellerCommission) / 100;

        const override = overridesMap[s._id.toString()];
        const visible = override?.visible ?? s.visible ?? true;
        const name     = override?.customName     || s.name;
        const category = override?.customCategory || s.category || "General";

        return {
          _id: s._id,
          serviceId: s.serviceId || s._id,
          name,
          category,
          platform: s.platform || "General",
          visible,
          providerRate,
          systemRate,
          resellerRate: finalRate,
          finalRate,
          rate: finalRate,
          min: Number(s.min ?? 1),
          max: Number(s.max ?? 100000),
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

    res.json({ services: formattedServices, commission: resellerCommission });
  } catch (error) {
    console.error("GET RESELLER SERVICES ERROR:", error);
    res.status(500).json({ message: "Failed to fetch services" });
  }
};

/* =========================================================
UPDATE SERVICE VISIBILITY (unchanged)
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
UPDATE SERVICE NAME OR CATEGORY (unchanged)
========================================================= */
export const updateServiceName = async (req, res) => {
  try {
    const { serviceId, newName, newCategoryName } = req.body;
    const resellerId = req.user._id;

    if (!serviceId) return res.status(400).json({ message: "Service ID required" });

    const service = await Service.findById(serviceId);
    if (!service) return res.status(404).json({ message: "Service not found" });

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
SET RESELLER COMMISSION (unchanged)
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
