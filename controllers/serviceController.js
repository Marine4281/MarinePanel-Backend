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
