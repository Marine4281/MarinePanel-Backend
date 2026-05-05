// controllers/serviceController.js
// FULL FILE — replace entire file

import Service from "../models/Service.js";
import Settings from "../models/Settings.js";
import ResellerService from "../models/ResellerService.js";
import { getCache, setCache } from "../utils/cache.js";

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
      // These are stored in the Service model with cpOwner = cp._id
      if (serviceMode === "own" || serviceMode === "both") {
        const ownServices = await Service.find({
          cpOwner: cp._id,
          status: true,
        }).lean();

        const priced = ownServices.map((s) => {
          const costRate  = Number(s.rate || 0);
          const finalRate = costRate + (costRate * cpCommission) / 100;
          return {
            ...s,
            _id:       s._id,
            serviceId: s.serviceId,
            costRate,
            finalRate,
            rate: finalRate,          // end users always see final price
            source: "own",
            isFree:       s.isFree || false,
            freeQuantity: s.freeQuantity || 0,
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
        const platformServices = await Service.find({
          status: true,
          availableToChildPanels: true,
          cpOwner: null,             // strictly main-panel services only
        }).lean();

        const priced = platformServices.map((s) => {
          const providerRate = Number(s.rate || 0);
          // Admin's commission is already baked into the rate stored in DB
          // when the admin sets prices. So we apply ONLY cpCommission on top.
          // BUT: if the DB stores the raw provider rate (pre-admin commission),
          // we need to add admin commission first. Check your admin flow.
          // In this codebase the admin's "rate" IS the rate to charge users
          // (after admin sets their price), so we apply cpCommission only:
          const systemRate = providerRate + (providerRate * adminCommission) / 100;
          const finalRate  = systemRate  + (systemRate  * cpCommission)    / 100;
          return {
            ...s,
            _id:        s._id,
            serviceId:  s.serviceId,
            providerRate,
            systemRate,
            finalRate,
            rate: finalRate,
            source: "platform",
            isFree:        s.isFree || false,
            freeQuantity:  s.freeQuantity || 0,
            cooldownHours: s.cooldownHours || 0,
            refillAllowed: s.refillAllowed || false,
            cancelAllowed: s.cancelAllowed || false,
            min: Number(s.min ?? 1),
            max: Number(s.max ?? 100000),
          };
        });

        services = [...services, ...priced];
      }

      // Filter any explicitly hidden
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

      // Only main-panel services (no CP-scoped ones)
      const services = await Service.find({ status: true, cpOwner: null }).lean();

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

          return {
            _id:       s._id,
            serviceId: s.serviceId || s._id,
            name:      s.name,
            category:  s.category || "General",
            platform:  s.platform || "General",
            description: s.description || "",
            icon: s.icon || "",
            isDefaultCategoryGlobal:   s.isDefaultCategoryGlobal  || false,
            isDefaultCategoryPlatform: s.isDefaultCategoryPlatform || false,
            isFree:        s.isFree || false,
            freeQuantity:  s.freeQuantity || 0,
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

    // Only main-panel services — exclude CP-scoped ones
    const services = await Service.find({ status: true, cpOwner: null })
      .sort({ createdAt: -1 })
      .lean();

    const formattedServices = services
      .map((s) => {
        const providerRate = Number(s.rate || 0);
        const finalRate    = providerRate + (providerRate * adminCommission) / 100;

        return {
          _id:       s._id,
          serviceId: s.serviceId || s._id,
          name:      s.name,
          category:  s.category || "General",
          platform:  s.platform || "General",
          description: s.description || "",
          icon: s.icon || "",
          isDefaultCategoryGlobal:   s.isDefaultCategoryGlobal  || false,
          isDefaultCategoryPlatform: s.isDefaultCategoryPlatform || false,
          isFree:        s.isFree || false,
          freeQuantity:  s.freeQuantity || 0,
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
