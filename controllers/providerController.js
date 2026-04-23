//controllers/providerController.js

import axios from "axios";
import ProviderService from "../models/ProviderService.js";
import Service from "../models/Service.js";
import ProviderProfile from "../models/ProviderProfile.js";

/*

Fetch services from provider API

*/
export const fetchProviderServices = async (req, res) => {
  try {
    let { apiUrl, apiKey, provider } = req.body;

    if (!provider) {
      return res.status(400).json({
        message: "provider is required",
      });
    }

    // ✅ AUTO LOAD PROVIDER PROFILE
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

    /* get existing services */
    const existingServices = await ProviderService.find({ provider });

    const existingMap = {};
    existingServices.forEach((s) => {
      existingMap[s.providerServiceId] = s;
    });

    // 🔥 TRACK provider IDs to detect deleted later
    const providerIds = new Set();

    const services = providerServices.map((service) => {
      const id = Number(service.service);
      providerIds.add(id);

      const existing = existingMap[id];

      let rateDiff = 0;
      let statusLabel = "new";

      if (existing) {
        rateDiff = Number(service.rate) - existing.rate;

        if (rateDiff !== 0) {
          statusLabel = "updated";
        } else {
          statusLabel = "imported";
        }
      }

      return {
        ...service,
        imported: !!existing,
        existingRate: existing?.rate || null,
        rateDiff,
        statusLabel,
        description: service.description || "", // safe fallback
      };
    });

    // 🔥 DETECT DELETED SERVICES (exist in DB but not provider anymore)
    const deletedServices = existingServices
      .filter((s) => !providerIds.has(s.providerServiceId))
      .map((s) => ({
        service: s.providerServiceId,
        name: s.name,
        category: s.category,
        rate: s.rate,
        min: s.min,
        max: s.max,
        imported: true,
        existingRate: s.rate,
        rateDiff: 0,
        statusLabel: "deleted",
        description: "",
      }));

    // ✅ MERGE ALL
const allServices = [...services, ...deletedServices];

    const grouped = {};
    allServices.forEach((service) => {
      if (!grouped[service.category]) grouped[service.category] = [];
      grouped[service.category].push(service);
    });

    const categories = Object.keys(grouped).map((category) => ({
      category,
      services: grouped[category],
    }));

    res.json(categories);

  } catch (error) {
    console.error("Provider API Error:", error.response?.data || error.message);
    res.status(500).json({ message: "Failed to fetch provider services" });
  }
};

/*

Save provider services to DB

*/
export const saveProviderServices = async (req, res) => {
  try {
    const { services, provider } = req.body;

    if (!provider) {
      return res.status(400).json({
        message: "provider is required",
      });
    }

    if (!services || services.length === 0) {
      return res.status(400).json({
        message: "No services provided",
      });
    }

    const operations = services.map((service) => ({
      updateOne: {
        filter: {
          provider,
          providerServiceId: Number(service.service),
        },
        update: {
          provider,
          providerServiceId: Number(service.service),
          name: service.name,
          category: service.category,
          rate: Number(service.rate),
          min: Number(service.min),
          max: Number(service.max),
        },
        upsert: true,
      },
    }));

    await ProviderService.bulkWrite(operations);

    res.json({
      message: "Services saved successfully",
      count: services.length,
    });

  } catch (error) {
    console.error("Save Provider Services Error:", error);

    res.status(500).json({
      message: "Failed to save services",
    });
  }
};

/*

Get all saved services

*/
export const getSavedProviderServices = async (req, res) => {
  try {
    const services = await ProviderService.find().sort({
      category: 1,
      name: 1,
    });

    res.json(services);

  } catch (error) {
    console.error("Get Provider Services Error:", error);

    res.status(500).json({
      message: "Failed to fetch services",
    });
  }
};

/*

Toggle service status

*/
export const toggleProviderServiceStatus = async (req, res) => {
  try {
    const service = await ProviderService.findById(req.params.id);

    if (!service) {
      return res.status(404).json({
        message: "Service not found",
      });
    }

    service.status = !service.status;

    await service.save();

    /* sync with panel services */
    await Service.updateMany(
      { providerServiceId: String(service.providerServiceId) },
      { status: service.status }
    );

    res.json(service);

  } catch (error) {
    console.error("Toggle Service Error:", error);

    res.status(500).json({
      message: "Failed to toggle service status",
    });
  }
};

/*

Delete provider service

*/
export const deleteProviderService = async (req, res) => {
  try {
    const service = await ProviderService.findByIdAndDelete(req.params.id);

    if (!service) {
      return res.status(404).json({
        message: "Service not found",
      });
    }

    await Service.deleteMany({
      providerServiceId: String(service.providerServiceId),
    });

    res.json({
      message: "Service deleted successfully",
    });

  } catch (error) {
    console.error("Delete Provider Service Error:", error);

    res.status(500).json({
      message: "Failed to delete service",
    });
  }
};

/*

Save provider profile

*/
export const saveProviderProfile = async (req, res) => {
  try {
    const { name, apiUrl, apiKey } = req.body;

    if (!name || !apiUrl || !apiKey) {
      return res.status(400).json({
        message: "All fields required",
      });
    }

    const profile = await ProviderProfile.findOneAndUpdate(
      { name },
      { name, apiUrl, apiKey },
      { upsert: true, new: true }
    );

    res.json(profile);

  } catch (error) {
    console.error("Save Provider Profile Error:", error);

    res.status(500).json({
      message: "Failed to save provider profile",
    });
  }
};

/*

Get provider profiles

*/
export const getProviderProfiles = async (req, res) => {
  try {
    const providers = await ProviderProfile.find().sort({ name: 1 });
    res.json(providers);

  } catch (error) {
    console.error("Get Provider Profiles Error:", error);

    res.status(500).json({
      message: "Failed to fetch providers",
    });
  }
};

/*

Generate next serviceId

*/
const generateServiceId = async () => {
  const last = await Service.findOne().sort({ serviceId: -1 });
  if (!last) return 1000;
  return last.serviceId + 1;
};

/*

Extract platform from category

*/
const extractPlatform = (category) => {
  if (!category) return "Other";
  return category.split("-")[0].trim();
};

/*

Import selected services

*/
export const importSelectedServices = async (req, res) => {
  try {
    const { services, provider } = req.body;

    if (!provider) {
      return res.status(400).json({
        message: "provider required",
      });
    }

    if (!services || services.length === 0) {
      return res.status(400).json({
        message: "No services selected",
      });
    }

    const profile = await ProviderProfile.findOne({ name: provider });

    if (!profile) {
      return res.status(400).json({
        message: "Provider profile not found",
      });
    }

    const { apiUrl, apiKey, _id: providerProfileId } = profile;

    let count = 0;

    for (const service of services) {
      const providerServiceId = Number(service.service);

      // 🔥 Normalize provider booleans (VERY IMPORTANT)
      const refillSupported =
        service.refill === true || service.refill === "true";

      const cancelSupported =
        service.cancel === true || service.cancel === "true";

      // ============================================
      // ✅ UPDATE PROVIDER SERVICE (SOURCE OF TRUTH)
      // ============================================
      await ProviderService.updateOne(
        { provider, providerServiceId },
        {
          provider,
          providerServiceId,
          name: service.name,
          category: service.category,
          rate: Number(service.rate),
          min: Number(service.min),
          max: Number(service.max),
          status: true,
        },
        { upsert: true }
      );

      // ============================================
      // ✅ CHECK IF PANEL SERVICE EXISTS
      // ============================================
      const existingService = await Service.findOne({
        providerServiceId: String(providerServiceId),
      });

      const numericRate = Number(service.rate);
      const platform = extractPlatform(service.category);

      // ============================================
      // 🆕 CREATE NEW SERVICE
      // ============================================
      if (!existingService) {
        const newServiceId = await generateServiceId();

        await Service.create({
          serviceId: newServiceId,
          platform,
          category: service.category,
          name: service.name,
          provider,
          providerServiceId: String(providerServiceId),

          providerApiUrl: apiUrl,
          providerApiKey: apiKey,

          rate: numericRate,
          lastSyncedRate: numericRate,
          previousRate: numericRate,

          min: Number(service.min),
          max: Number(service.max),

          isFree: false,
          freeQuantity: 0,
          cooldownHours: 0,
          description: service.description || "",

          status: true,

          // 🔥 REFILL + CANCEL (PROVIDER BASED)
          refillAllowed: refillSupported,
          cancelAllowed: cancelSupported,

          // 🧠 YOUR SYSTEM POLICY
          refillPolicy: refillSupported ? "30d" : "none",
          customRefillDays: null,

          isDefault: false,
          isDefaultCategoryGlobal: false,
          isDefaultCategoryPlatform: false,

          providerProfileId,
        });
      }

      // ============================================
      // 🔄 UPDATE EXISTING SERVICE (CRITICAL FIX)
      // ============================================
      else {
        existingService.name = service.name;
        existingService.category = service.category;
        existingService.rate = numericRate;
        existingService.lastSyncedRate = numericRate;

        existingService.min = Number(service.min);
        existingService.max = Number(service.max);

        existingService.providerApiUrl = apiUrl;
        existingService.providerApiKey = apiKey;

        // 🔥 KEEP PANEL IN SYNC WITH PROVIDER
        existingService.refillAllowed = refillSupported;
        existingService.cancelAllowed = cancelSupported;

        // 🧠 Only auto-set policy if not manually customized
        if (
          existingService.refillPolicy === "none" ||
          !existingService.refillPolicy
        ) {
          existingService.refillPolicy = refillSupported
            ? "30d"
            : "none";
        }

        await existingService.save();
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
