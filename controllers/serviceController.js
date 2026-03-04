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
    const cacheKey = "public_services";

    // 🔥 1️⃣ Check cache first
    const cached = getCache(cacheKey);
    if (cached) {
      return res.status(200).json(cached);
    }

    // 🔥 2️⃣ Fetch from DB if not cached
    const services = await Service.find({ status: true })
      .sort({ createdAt: -1 })
      .lean();

    // 🔥 3️⃣ Store in cache for 5 minutes
    setCache(cacheKey, services, 300);

    res.status(200).json(services);

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
