// controllers/serviceController.js

import Service from "../models/Service.js";
import Settings from "../models/Settings.js";
import ResellerService from "../models/ResellerService.js";
import { getCache, setCache } from "../utils/cache.js";

/* =========================================================
   GET PUBLIC SERVICES (SMART)
========================================================= */
export const getServicesPublic = async (req, res) => {
  try {
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
            override?.visible ?? s.visible ?? true;

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
        .filter((s) => s.visible);

      return res.status(200).json(formattedServices);
    }

    /*
    ========================================================
    🔵 CASE 2: Main Panel (Public)
    ========================================================
    */
    const cacheKey = "public_services";

    // 1️⃣ Check cache
    const cached = getCache(cacheKey);
    if (cached) {
      return res.status(200).json(cached);
    }

    // 2️⃣ Fetch admin commission
    const settings = await Settings.findOne();
    const adminCommission = Number(settings?.commission || 0);

    // 3️⃣ Fetch services
    const services = await Service.find({ status: true })
      .sort({ createdAt: -1 })
      .lean();

    // 4️⃣ Apply admin commission
    const formattedServices = services.map((s) => {
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
        visible: s.visible ?? true,

        providerRate,
        systemRate: finalRate,
        finalRate,
        rate: finalRate,

        min: Number(s.min ?? 1),
        max: Number(s.max ?? 100000),
      };
    }).filter((s) => s.visible);

    // 5️⃣ Cache final result (IMPORTANT FIX)
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
