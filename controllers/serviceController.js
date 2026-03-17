// controllers/serviceController.js

import Service from "../models/Service.js";
import { getCache, setCache } from "../utils/cache.js";

/* =========================================================
   GET PUBLIC SERVICES (CACHED)
   - Only active services
   - Clears automatically when admin updates
========================================================= */
export const getServicesPublic = async (req, res) => {
  try {
    /*
    --------------------------------
    If request is from reseller domain
    --------------------------------
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

      const formatted = services.map((s) => {
        const providerRate = Number(s.rate || 0);

        const systemRate =
          providerRate + (providerRate * adminCommission) / 100;

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
          price: resellerRate, // 👈 IMPORTANT (final price)
          min: Number(s.min ?? 1),
          max: Number(s.max ?? 100000),
        };
      });

      return res.json(formatted);
    }

    /*
    --------------------------------
    Normal public (main panel)
    --------------------------------
    */
    const cacheKey = "public_services";

    const cached = getCache(cacheKey);
    if (cached) return res.status(200).json(cached);

    const services = await Service.find({ status: true })
      .sort({ createdAt: -1 })
      .lean();

    setCache(cacheKey, services, 300);

    res.status(200).json(services);

  } catch (error) {
    console.error("GET PUBLIC SERVICES ERROR:", error);
    res.status(500).json({
      message: "Failed to fetch services",
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
