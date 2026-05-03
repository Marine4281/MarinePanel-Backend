// controllers/serviceController.js

import Service from "../models/Service.js";
import Settings from "../models/Settings.js";
import ResellerService from "../models/ResellerService.js";
import { getCache, setCache } from "../utils/cache.js";

/* =========================================================
   GET PUBLIC SERVICES (SMART + FREE SUPPORT)
========================================================= */
export const getServicesPublic = async (req, res) => {
  try {

     //Child Panel
     if (req.childPanel) {
      const cp = req.childPanel;
      const serviceMode = cp.childPanelServiceMode || "none";

      const cpSettings = await Settings.findOne().lean();
      const adminCommission = Number(cpSettings?.commission || 0);

      let services = [];

      if (serviceMode === "own" || serviceMode === "both") {
        // Fetch services imported by this child panel from their own providers
        // These live in a separate ProviderService collection scoped by childPanelOwner
        const { default: ProviderService } = await import("../models/ProviderService.js");
        const ownServices = await ProviderService.find({
          childPanelOwner: cp._id,
          status: true,
        }).lean();
        services = [...services, ...ownServices];
      }

      if (serviceMode === "platform" || serviceMode === "both") {
        // Fetch main platform services that admin has made available to child panels
        const platformServices = await Service.find({
          status: true,
          availableToChildPanels: true,
        }).lean();

        const cpCommission = Number(cp.childPanelCommissionRate || 0);

        const priced = platformServices.map((s) => {
          const providerRate = Number(s.rate || 0);
          const systemRate = providerRate + (providerRate * adminCommission) / 100;
          const finalRate = systemRate + (systemRate * cpCommission) / 100;
          return {
            ...s,
            providerRate,
            systemRate,
            finalRate,
            rate: finalRate,
            source: "platform",
          };
        });

        services = [...services, ...priced];
      }

      // If serviceMode is 'none' — return empty, child panel hasn't configured yet
      const visible = services.filter((s) => s.visible !== false);
      return res.status(200).json(visible);
     }
    /*
    ========================================================
    🟢 CASE 1: Reseller Domain
    ========================================================
    */
    if (req.reseller) {
      const reseller = req.reseller;

      const resellerCommission = Number(reseller.resellerCommissionRate || 0);

      const settings = await Settings.findOne();
      const adminCommission = Number(settings?.commission || 0);

      const services = await Service.find({ status: true }).lean();

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

          const systemRate =
            providerRate + (providerRate * adminCommission) / 100;

          const finalRate =
            systemRate + (systemRate * resellerCommission) / 100;

          const override = overridesMap[s._id.toString()];

          const visible =
            override?.visible ?? (s.visible !== false);

          return {
            _id: s._id,
            serviceId: s.serviceId || s._id,
            name: s.name,
            category: s.category || "General",
            platform: s.platform || "General",
            description: s.description || "",
            icon: s.icon || "",
            isDefaultCategoryGlobal: s.isDefaultCategoryGlobal || false,
            isDefaultCategoryPlatform: s.isDefaultCategoryPlatform || false,

            // ✅ FIXED: FREE SUPPORT
            isFree: s.isFree || false,
            freeQuantity: s.freeQuantity || 0,
            cooldownHours: s.cooldownHours || 0,

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

    /*
    ========================================================
    🔵 CASE 2: Main Panel (Public)
    ========================================================
    */
    const cacheKey = "public_services";

    const cached = getCache(cacheKey);
    if (cached) {
      return res.status(200).json(cached);
    }

    const settings = await Settings.findOne();
    const adminCommission = Number(settings?.commission || 0);

    const services = await Service.find({ status: true })
      .sort({ createdAt: -1 })
      .lean();

    const formattedServices = services
      .map((s) => {
        const providerRate = Number(s.rate || 0);

        const finalRate =
          providerRate + (providerRate * adminCommission) / 100;

        return {
          _id: s._id,
          serviceId: s.serviceId || s._id,
          name: s.name,
          category: s.category || "General",
          platform: s.platform || "General",
          description: s.description || "",
          icon: s.icon || "",
          isDefaultCategoryGlobal: s.isDefaultCategoryGlobal || false,
          isDefaultCategoryPlatform: s.isDefaultCategoryPlatform || false,

          // ✅ FIXED: FREE SUPPORT
          isFree: s.isFree || false,
          freeQuantity: s.freeQuantity || 0,
          cooldownHours: s.cooldownHours || 0,

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
    res.status(500).json({
      message: "Failed to fetch services",
      error: error.message,
    });
  }
};

/* =========================================================
   🆕 CREATE SERVICE (ADMIN)
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
    res.status(500).json({
      message: "Failed to create service",
      error: error.message,
    });
  }
};

/* =========================================================
   ✏️ UPDATE SERVICE (ADMIN)
========================================================= */
export const updateService = async (req, res) => {
  try {
    const service = await Service.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    setCache("public_services", null, 1);

    const io = req.app.get("io");
    if (io) io.emit("servicesUpdated");

    res.status(200).json(service);
  } catch (error) {
    console.error("UPDATE SERVICE ERROR:", error);
    res.status(500).json({
      message: "Failed to update service",
      error: error.message,
    });
  }
};

/* =========================================================
   ❌ DELETE SERVICE (ADMIN)
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
    res.status(500).json({
      message: "Failed to delete service",
      error: error.message,
    });
  }
};
