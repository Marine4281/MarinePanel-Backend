import axios from "axios";
import ProviderService from "../models/ProviderService.js";
import Service from "../models/Service.js";
import ProviderProfile from "../models/ProviderProfile.js";

/* =======================================================
   FETCH SERVICES → NOW GROUPED BY CATEGORY
======================================================= */
export const fetchProviderServices = async (req, res) => {
  try {
    let { apiUrl, apiKey, provider } = req.body;

    if (!provider) {
      return res.status(400).json({ message: "provider is required" });
    }

    // ✅ Load provider profile
    const profile = await ProviderProfile.findOne({ name: provider });

    if (profile) {
      apiUrl = profile.apiUrl;
      apiKey = profile.apiKey;
    }

    if (!apiUrl || !apiKey) {
      return res.status(400).json({
        message: "apiUrl and apiKey are required",
      });
    }

    const params = new URLSearchParams();
    params.append("key", apiKey);
    params.append("action", "services");

    const response = await axios.post(apiUrl, params, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    const providerServices = response.data;

    /* existing services */
    const existingServices = await ProviderService.find({ provider });

    const existingMap = {};
    existingServices.forEach((s) => {
      existingMap[s.providerServiceId] = s;
    });

    /* 🔥 FORMAT + ENRICH */
    const formatted = providerServices.map((service) => {
      const id = Number(service.service);
      const existing = existingMap[id];

      const newRate = Number(service.rate);
      const oldRate = existing?.rate || 0;

      return {
        service: id,
        name: service.name,
        category: service.category || "Other",
        rate: newRate,
        min: Number(service.min),
        max: Number(service.max),
        description: service.description || "",

        imported: !!existing,
        existingRate: existing?.rate || null,
        rateDiff: existing ? newRate - oldRate : 0,
      };
    });

    /* 🔥 GROUP BY CATEGORY */
    const grouped = Object.values(
      formatted.reduce((acc, s) => {
        if (!acc[s.category]) {
          acc[s.category] = {
            category: s.category,
            services: [],
          };
        }

        acc[s.category].services.push(s);
        return acc;
      }, {})
    );

    res.json(grouped);

  } catch (error) {
    console.error("Provider API Error:", error.response?.data || error.message);

    res.status(500).json({
      message: "Failed to fetch provider services",
    });
  }
};

/* =======================================================
   GENERATE SERVICE ID
======================================================= */
const generateServiceId = async () => {
  const last = await Service.findOne().sort({ serviceId: -1 });
  return last ? last.serviceId + 1 : 1000;
};

/* =======================================================
   EXTRACT PLATFORM
======================================================= */
const extractPlatform = (category) => {
  if (!category) return "Other";
  return category.split("-")[0].trim();
};

/* =======================================================
   IMPORT SELECTED SERVICES (UPDATED 🔥)
   Now accepts: service IDs only
======================================================= */
export const importSelectedServices = async (req, res) => {
  try {
    const { services, providerProfileId } = req.body;

    if (!providerProfileId) {
      return res.status(400).json({
        message: "providerProfileId required",
      });
    }

    if (!services || services.length === 0) {
      return res.status(400).json({
        message: "No services selected",
      });
    }

    const profile = await ProviderProfile.findById(providerProfileId);

    if (!profile) {
      return res.status(400).json({
        message: "Provider profile not found",
      });
    }

    const { apiUrl, apiKey, name: provider } = profile;

    // 🔥 Get latest provider services again
    const params = new URLSearchParams();
    params.append("key", apiKey);
    params.append("action", "services");

    const response = await axios.post(apiUrl, params, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    const providerServices = response.data;

    let count = 0;

    for (const s of providerServices) {
      const id = Number(s.service);

      if (!services.includes(id)) continue;

      const platform = extractPlatform(s.category);

      /* save provider service */
      await ProviderService.updateOne(
        {
          provider,
          providerServiceId: id,
        },
        {
          provider,
          providerServiceId: id,
          name: s.name,
          category: s.category,
          rate: Number(s.rate),
          min: Number(s.min),
          max: Number(s.max),
          status: true,
        },
        { upsert: true }
      );

      /* create panel service if not exists */
      const exists = await Service.findOne({
        providerServiceId: String(id),
      });

      if (!exists) {
        const newServiceId = await generateServiceId();

        await Service.create({
          serviceId: newServiceId,
          platform,
          category: s.category,
          name: s.name,
          provider,
          providerServiceId: String(id),

          providerApiUrl: apiUrl,
          providerApiKey: apiKey,

          rate: Number(s.rate),
          min: Number(s.min),
          max: Number(s.max),

          description: s.description || "",

          status: true,
        });
      }

      count++;
    }

    res.json({
      message: "Selected services imported",
      count,
    });

  } catch (error) {
    console.error("Import Selected Services Error:", error);

    res.status(500).json({
      message: "Failed to import services",
    });
  }
};

/* =======================================================
   IMPORT CATEGORY (UPDATED 🔥)
======================================================= */
export const importCategoryServices = async (req, res) => {
  try {
    const { category, providerProfileId } = req.body;

    if (!providerProfileId) {
      return res.status(400).json({
        message: "providerProfileId required",
      });
    }

    const profile = await ProviderProfile.findById(providerProfileId);

    if (!profile) {
      return res.status(400).json({
        message: "Provider not found",
      });
    }

    const { apiUrl, apiKey } = profile;

    const params = new URLSearchParams();
    params.append("key", apiKey);
    params.append("action", "services");

    const response = await axios.post(apiUrl, params, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    const providerServices = response.data;

    const filteredIds = providerServices
      .filter((s) => s.category === category)
      .map((s) => Number(s.service));

    req.body.services = filteredIds;

    return importSelectedServices(req, res);

  } catch (error) {
    console.error("Import Category Error:", error);

    res.status(500).json({
      message: "Failed to import category",
    });
  }
};
