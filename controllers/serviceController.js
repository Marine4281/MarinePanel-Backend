// controllers/serviceController.js

import Service from "../models/Service.js";
import Settings from "../models/Settings.js";
import ResellerService from "../models/ResellerService.js";
import { getCache, setCache } from "../utils/cache.js";

/* =========================================================
   GET PUBLIC SERVICES (SMART)
   - Detects reseller domain
   - Applies reseller pricing if needed
========================================================= */
export const getServicesPublic = async (req, res) => {
  try {
    /*
    ========================================================
    🟢 CASE 1: Request is from reseller domain
    ========================================================
    */
    if (req.reseller) {
      const reseller = req.reseller;

      const resellerCommission = Number(reseller.resellerCommissionRate || 0);

      // Get admin commission
      const settings = await Settings.findOne();
      const adminCommission = Number(settings?.commission || 0);

      // Get services
      const services = await Service.find({ status: true }).lean();

      // Get reseller overrides
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

          // Admin price
          const systemRate =
            providerRate + (providerRate * adminCommission) / 100;

          // Reseller price
          const resellerRate =
            systemRate + (systemRate * resellerCommission) / 100;

          const override = overridesMap[s._id.toString()];

          const visible =
            override && override.visible !== undefined
              ? override.visible
              : s.visible ?? true;

          return {
            _id: s._id,
            serviceId: s.serviceId || s._id,
            name: s.name,
            category: s.category || "General",
            visible,
            price: resellerRate, // ✅ FINAL PRICE FOR USER
            min: Number(s.min ?? 1),
            max: Number(s.max ?? 100000),
          };
        })
        .filter((s) => s.visible); // hide disabled services

      return res.status(200).json(formattedServices);
    }

    /*
    ========================================================
    🔵 CASE 2: Normal public (main panel)
    ========================================================
    */
    const cacheKey = "public_services";

    // 1️⃣ Check cache
    const cached = getCache(cacheKey);
    if (cached) {
      return res.status(200).json(cached);
    }

    // 2️⃣ Fetch from DB
    const services = await Service.find({ status: true })
      .sort({ createdAt: -1 })
      .lean();

    // 3️⃣ Cache for 5 minutes
    setCache(cacheKey, services, 300);

    return res.status(200).json(services);

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

    // 🔥 Clear cache
    setCache("public_services", null, 1);

    // 🔥 Emit socket update
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

    // 🔥 Clear cache
    setCache("public_services", null, 1);

    // 🔥 Emit socket update
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

    // 🔥 Clear cache
    setCache("public_services", null, 1);

    // 🔥 Emit socket update
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
