// controllers/serviceController.js
// FULL FILE — replace entire file

import Service from "../models/Service.js";
import Settings from "../models/Settings.js";
import ResellerService from "../models/ResellerService.js";
import { getCache, setCache } from "../utils/cache.js";

// Newest category on top, provider order (serviceId asc) within each category
function sortByNewestCategoryFirst(services) {
  const categoryMaxId = {};
  services.forEach((s) => {
    const cat = s.category || "General";
    if (categoryMaxId[cat] === undefined || s.serviceId > categoryMaxId[cat]) {
      categoryMaxId[cat] = s.serviceId;
    }
  });
  return services.slice().sort((a, b) => {
    const catDiff =
      (categoryMaxId[b.category || "General"] ?? 0) -
      (categoryMaxId[a.category || "General"] ?? 0);
    if (catDiff !== 0) return catDiff;
    return (a.serviceId ?? 0) - (b.serviceId ?? 0);
  });
}

/* =========================================================
   GET PUBLIC SERVICES (SMART + FREE SUPPORT)
========================================================= */
export const getServicesPublic = async (req, res) => {
  try {

    // ══════════════════════════════════════════════════════
    // CHILD PANEL — end users visiting a CP domain
    // ══════════════════════════════════════════════════════
    if (req.childPanel) {
      const cp = req.childPanel;
      const serviceMode = cp.childPanelServiceMode || "none";

      if (serviceMode === "none") {
        return res.status(200).json([]);
      }

      const settings = await Settings.findOne().lean();
      const adminCommission = Number(settings?.commission || 0);
      const cpCommission    = Number(cp.childPanelCommissionRate || 0);

      let services = [];

      // ── OWN services: imported from CP's own providers OR manually added ──
      if (serviceMode === "own" || serviceMode === "both") {
        const ownServices = sortByNewestCategoryFirst(
  await Service.find({ cpOwner: cp._id, status: true })
    .sort({ serviceId: 1 })
    .lean()
);

        const priced = ownServices.map((s) => {
          const costRate  = Number(s.rate || 0);
          const finalRate = costRate + (costRate * cpCommission) / 100;
          return {
            ...s,
            _id:       s._id,
            serviceId: s.serviceId,
            costRate,
            finalRate,
            rate: finalRate,
            source: "own",
            platform:    s.platform    || "General",
            category:    s.category    || "General",
            serviceType: s.serviceType || "Default",
            description: s.description || "",
            icon:        s.icon        || "",
            isDefaultCategoryGlobal:   s.isDefaultCategoryGlobal   || false,
            isDefaultCategoryPlatform: s.isDefaultCategoryPlatform || false,
            isFree:        s.isFree        || false,
            freeQuantity:  s.freeQuantity  || 0,
            cooldownHours: s.cooldownHours || 0,
            refillAllowed: s.refillAllowed || false,
            cancelAllowed: s.cancelAllowed || false,
            min: Number(s.min ?? 1),
            max: Number(s.max ?? 100000),
          };
        });

        services = [...services, ...priced];
      }

      // ── PLATFORM services: main admin published these for child panels ──
      if (serviceMode === "platform" || serviceMode === "both") {
        const platformServices = sortByNewestCategoryFirst(
  await Service.find({ status: true, availableToChildPanels: true, cpOwner: null })
    .sort({ serviceId: 1 })
    .lean()
);

        const priced = platformServices.map((s) => {
          const providerRate = Number(s.rate || 0);
          const systemRate   = providerRate + (providerRate * adminCommission) / 100;
          const finalRate    = systemRate   + (systemRate   * cpCommission)    / 100;
          return {
            ...s,
            _id:       s._id,
            serviceId: s.serviceId,
            providerRate,
            systemRate,
            finalRate,
            rate: finalRate,
            source: "platform",
            platform:    s.platform    || "General",
            category:    s.category    || "General",
            serviceType: s.serviceType || "Default",
            description: s.description || "",
            icon:        s.icon        || "",
            isDefaultCategoryGlobal:   s.isDefaultCategoryGlobal   || false,
            isDefaultCategoryPlatform: s.isDefaultCategoryPlatform || false,
            isFree:        s.isFree        || false,
            freeQuantity:  s.freeQuantity  || 0,
            cooldownHours: s.cooldownHours || 0,
            refillAllowed: s.refillAllowed || false,
            cancelAllowed: s.cancelAllowed || false,
            min: Number(s.min ?? 1),
            max: Number(s.max ?? 100000),
          };
        });

        services = [...services, ...priced];
      }

      // When mode is "both", own services take priority over platform services
      // with the same name — deduplicate keeping the own version.
      if (serviceMode === "both") {
        const seen = new Set();
        services = services.filter((s) => {
          const key = s.name.toLowerCase().trim();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }

      const visible = services.filter((s) => s.status !== false);
      return res.status(200).json(visible);
    }

    // ══════════════════════════════════════════════════════
    // RESELLER DOMAIN
    // ══════════════════════════════════════════════════════
    if (req.reseller) {
      const reseller = req.reseller;
      const resellerCommission = Number(reseller.resellerCommissionRate || 0);

      const settings = await Settings.findOne();
      const adminCommission = Number(settings?.commission || 0);

      const services = sortByNewestCategoryFirst(
  await Service.find({ status: true, cpOwner: null })
    .sort({ serviceId: 1 })
    .lean()
);

      const resellerOverrides = await ResellerService.find({
        resellerId: reseller._id,
      }).lean();

      const overridesMap = {};
      resellerOverrides.forEach((r) => {
        overridesMap[r.serviceId.toString()] = r;
      });

      const formattedServices = services
        .map((s) => {
          const providerRate = Number(s.rate || 0);
          const systemRate   = providerRate + (providerRate * adminCommission)    / 100;
          const finalRate    = systemRate   + (systemRate   * resellerCommission) / 100;

          const override = overridesMap[s._id.toString()];
          const visible  = override?.visible ?? (s.visible !== false);

          // Apply reseller name/category overrides at read time
          const name     = override?.customName     || s.name;
          const category = override?.customCategory || s.category || "General";

          return {
            _id:       s._id,
            serviceId: s.serviceId || s._id,
            name,
            category,
            platform:    s.platform    || "General",
            description: s.description || "",
            icon:        s.icon        || "",
            serviceType: s.serviceType || "Default",
            isDefaultCategoryGlobal:   s.isDefaultCategoryGlobal   || false,
            isDefaultCategoryPlatform: s.isDefaultCategoryPlatform || false,
            isFree:        s.isFree        || false,
            freeQuantity:  s.freeQuantity  || 0,
            cooldownHours: s.cooldownHours || 0,
            refillAllowed: s.refillAllowed || false,
            cancelAllowed: s.cancelAllowed || false,
            visible,
            providerRate,
            systemRate,
            resellerRate: finalRate,
            finalRate,
            rate: finalRate,
            min: Number(s.min ?? 1),
            max: Number(s.max ?? 100000),
          };
        })
        .filter((s) => s.visible !== false);

      return res.status(200).json(formattedServices);
    }

    // ══════════════════════════════════════════════════════
    // MAIN PANEL PUBLIC
    // ══════════════════════════════════════════════════════
    const cacheKey = "public_services";
    const cached = getCache(cacheKey);
    if (cached) return res.status(200).json(cached);

    const settings = await Settings.findOne();
    const adminCommission = Number(settings?.commission || 0);

    const services = sortByNewestCategoryFirst(
  await Service.find({ status: true, cpOwner: null })
    .sort({ serviceId: 1 })
    .lean()
);

    const formattedServices = services
      .map((s) => {
        const providerRate = Number(s.rate || 0);
        const finalRate    = providerRate + (providerRate * adminCommission) / 100;

        return {
          _id:       s._id,
          serviceId: s.serviceId || s._id,
          name:      s.name,
          category:  s.category  || "General",
          platform:  s.platform  || "General",
          description: s.description || "",
          icon:        s.icon        || "",
          serviceType: s.serviceType || "Default",
          isDefaultCategoryGlobal:   s.isDefaultCategoryGlobal   || false,
          isDefaultCategoryPlatform: s.isDefaultCategoryPlatform || false,
          isFree:        s.isFree        || false,
          freeQuantity:  s.freeQuantity  || 0,
          cooldownHours: s.cooldownHours || 0,
          refillAllowed: s.refillAllowed || false,
          cancelAllowed: s.cancelAllowed || false,
          visible: s.visible !== false,
          providerRate,
          systemRate: finalRate,
          finalRate,
          rate: finalRate,
          min: Number(s.min ?? 1),
          max: Number(s.max ?? 100000),
        };
      })
      .filter((s) => s.visible !== false);

    setCache(cacheKey, formattedServices, 300);
    return res.status(200).json(formattedServices);

  } catch (error) {
    console.error("GET PUBLIC SERVICES ERROR:", error);
    res.status(500).json({ message: "Failed to fetch services", error: error.message });
  }
};

/* =========================================================
   CREATE SERVICE (ADMIN)
========================================================= */
export const createService = async (req, res) => {
  try {
    const service = await Service.create(req.body);
    setCache("public_services", null, 1);
    const io = req.app.get("io");
    if (io) io.emit("servicesUpdated");
    res.status(201).json(service);
  } catch (error) {
    console.error("CREATE SERVICE ERROR:", error);
    res.status(500).json({ message: "Failed to create service", error: error.message });
  }
};

/* =========================================================
   UPDATE SERVICE (ADMIN)
========================================================= */
export const updateService = async (req, res) => {
  try {
    const service = await Service.findByIdAndUpdate(req.params.id, req.body, { new: true });
    setCache("public_services", null, 1);
    const io = req.app.get("io");
    if (io) io.emit("servicesUpdated");
    res.status(200).json(service);
  } catch (error) {
    console.error("UPDATE SERVICE ERROR:", error);
    res.status(500).json({ message: "Failed to update service", error: error.message });
  }
};

/* =========================================================
   DELETE SERVICE (ADMIN)
========================================================= */
export const deleteService = async (req, res) => {
  try {
    await Service.findByIdAndDelete(req.params.id);
    setCache("public_services", null, 1);
    const io = req.app.get("io");
    if (io) io.emit("servicesUpdated");
    res.status(200).json({ message: "Service deleted successfully" });
  } catch (error) {
    console.error("DELETE SERVICE ERROR:", error);
    res.status(500).json({ message: "Failed to delete service", error: error.message });
  }
};
