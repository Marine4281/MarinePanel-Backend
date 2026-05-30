// controllers/cpOwnerProviderController.js
//
// Child panel owner managing their own provider API connections.
// Mirrors providerController.js + ProviderProfileController.js
// but every provider profile is scoped to this child panel owner
// via cpOwner field on ProviderProfile.
//
// IMPORTANT: ProviderProfile model needs a cpOwner field added:
//   cpOwner: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true }
// And the unique index changed from { name: 1 } to { name: 1, cpOwner: 1 }
// so the same provider name can exist on different child panels.

import axios from "axios";
import ProviderProfile from "../models/ProviderProfile.js";
import ProviderService from "../models/ProviderService.js";
import Service from "../models/Service.js";
import User from "../models/User.js";
import Counter from "../models/Counter.js";

// ======================= HELPERS =======================

const extractPlatform = (category) => {
  if (!category) return "Other";
  return category.split("-")[0].trim();
};

const generateServiceId = async () => {
  const last = await Service.findOne().sort({ serviceId: -1 });
  if (!last) return 1000;
  return last.serviceId + 1;
};

// ======================= GET PROVIDER PROFILES =======================

export const getCPProviderProfiles = async (req, res) => {
  try {
    const providers = await ProviderProfile.find({ cpOwner: req.user._id })
      .sort({ createdAt: -1 })
      .lean();

    res.json(providers);
  } catch (error) {
    console.error("CP GET PROVIDERS ERROR:", error);
    res.status(500).json({ message: "Failed to fetch providers" });
  }
};

// ======================= GET SINGLE PROVIDER =======================

export const getCPProviderProfileById = async (req, res) => {
  try {
    const provider = await ProviderProfile.findOne({
      _id: req.params.id,
      cpOwner: req.user._id,
    });

    if (!provider) {
      return res.status(404).json({ message: "Provider not found" });
    }

    res.json(provider);
  } catch (error) {
    console.error("CP GET PROVIDER ERROR:", error);
    res.status(500).json({ message: "Failed to fetch provider" });
  }
};

// ======================= CREATE PROVIDER PROFILE =======================

export const createCPProviderProfile = async (req, res) => {
  try {
    const { name, apiUrl, apiKey } = req.body;

    if (!name || !apiUrl || !apiKey) {
      return res.status(400).json({
        message: "Name, API URL and API Key are required",
      });
    }

    const existing = await ProviderProfile.findOne({
      name,
      cpOwner: req.user._id,
    });

    if (existing) {
      return res.status(400).json({ message: "Provider already exists" });
    }

    const provider = await ProviderProfile.create({
      name,
      apiUrl,
      apiKey,
      cpOwner: req.user._id,
    });

    res.status(201).json({
      message: "Provider created successfully",
      provider,
    });
  } catch (error) {
    console.error("CP CREATE PROVIDER ERROR:", error);
    res.status(500).json({ message: "Failed to create provider" });
  }
};

// ======================= UPDATE PROVIDER PROFILE =======================

export const updateCPProviderProfile = async (req, res) => {
  try {
    const { name, apiUrl, apiKey } = req.body;

    const provider = await ProviderProfile.findOne({
      _id: req.params.id,
      cpOwner: req.user._id,
    });

    if (!provider) {
      return res.status(404).json({ message: "Provider not found" });
    }

    if (name && name !== provider.name) {
      const existing = await ProviderProfile.findOne({
        name,
        cpOwner: req.user._id,
      });
      if (existing) {
        return res.status(400).json({ message: "Provider name already exists" });
      }
    }

    provider.name   = name   || provider.name;
    provider.apiUrl = apiUrl || provider.apiUrl;
    provider.apiKey = apiKey || provider.apiKey;

    await provider.save();

    res.json({ message: "Provider updated successfully", provider });
  } catch (error) {
    console.error("CP UPDATE PROVIDER ERROR:", error);
    res.status(500).json({ message: "Failed to update provider" });
  }
};

// ======================= DELETE PROVIDER PROFILE =======================

export const deleteCPProviderProfile = async (req, res) => {
  try {
    const provider = await ProviderProfile.findOne({
      _id: req.params.id,
      cpOwner: req.user._id,
    });

    if (!provider) {
      return res.status(404).json({ message: "Provider not found" });
    }

    await provider.deleteOne();

    res.json({ message: "Provider deleted successfully" });
  } catch (error) {
    console.error("CP DELETE PROVIDER ERROR:", error);
    res.status(500).json({ message: "Failed to delete provider" });
  }
};

// ======================= FETCH SERVICES FROM PROVIDER API =======================

export const fetchCPProviderServices = async (req, res) => {
  try {
    const { provider } = req.body;

    if (!provider) {
      return res.status(400).json({ message: "provider is required" });
    }

    const profile = await ProviderProfile.findOne({
      name: provider,
      cpOwner: req.user._id,
    });

    if (!profile) {
      return res.status(404).json({ message: "Provider profile not found" });
    }

    const params = new URLSearchParams();
    params.append("key", profile.apiKey);
    params.append("action", "services");

    const response = await axios.post(profile.apiUrl, params, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    const providerServices = response.data;

    const existingServices = await ProviderService.find({
      provider,
      cpOwner: req.user._id,
    });

    const existingMap = {};
    existingServices.forEach((s) => {
      existingMap[s.providerServiceId] = s;
    });

    const providerIds = new Set();

    const services = providerServices.map((service) => {
      const id = Number(service.service);
      providerIds.add(id);

      const existing = existingMap[id];
      let rateDiff = 0;
      let statusLabel = "new";

      if (existing) {
        rateDiff = Number(service.rate) - existing.rate;
        statusLabel = rateDiff !== 0 ? "updated" : "imported";
      }

      return {
        ...service,
        imported: !!existing,
        existingRate: existing?.rate || null,
        rateDiff,
        statusLabel,
        description: service.description || "",
      };
    });

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

    const allServices = [...services, ...deletedServices];

    const grouped = {};
    allServices.forEach((service) => {
      if (!grouped[service.category]) grouped[service.category] = [];
      grouped[service.category].push(service);
    });

    const categories = Object.keys(grouped)
  .map((category) => ({
    category,
    services: grouped[category], // preserve provider order within category
  }))
  .sort((a, b) => {
    // newest category (highest service ID) first
    const maxA = Math.max(...a.services.map((s) => Number(s.service) || 0));
    const maxB = Math.max(...b.services.map((s) => Number(s.service) || 0));
    return maxB - maxA;
  });

res.json(categories);
  } catch (error) {
    console.error("CP FETCH PROVIDER SERVICES ERROR:", error);
    res.status(500).json({ message: "Failed to fetch provider services" });
  }
};

// ======================= IMPORT SELECTED SERVICES =======================

export const importCPSelectedServices = async (req, res) => {
  try {
    const { services, provider } = req.body;

    if (!provider) {
      return res.status(400).json({ message: "provider required" });
    }

    if (!services || services.length === 0) {
      return res.status(400).json({ message: "No services selected" });
    }

    const profile = await ProviderProfile.findOne({
      name: provider,
      cpOwner: req.user._id,
    });

    if (!profile) {
      return res.status(400).json({ message: "Provider profile not found" });
    }

    const { apiUrl, apiKey, _id: providerProfileId } = profile;

    let count = 0;

    for (const service of services) {
      const providerServiceId = Number(service.service);

      const refillSupported =
        service.refill === true || service.refill === "true";
      const cancelSupported =
        service.cancel === true || service.cancel === "true";

      // Provider APIs return a "type" field — map it to our serviceType.
      // This is critical for Custom Comments services to work correctly.
      const serviceType = service.type || "Default";

      await ProviderService.updateOne(
        { provider, providerServiceId, cpOwner: req.user._id },
        {
          provider,
          providerServiceId,
          name: service.name,
          category: service.category,
          rate: Number(service.rate),
          min: Number(service.min),
          max: Number(service.max),
          status: true,
          cpOwner: req.user._id,
        },
        { upsert: true }
      );

      const existingService = await Service.findOne({
        providerServiceId: String(providerServiceId),
        cpOwner: req.user._id,
      });

      const numericRate = Number(service.rate);
      const platform = extractPlatform(service.category);

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
          serviceType,                  // ← saved from provider API response
          status: true,
          refillAllowed: refillSupported,
          cancelAllowed: cancelSupported,
          refillPolicy: refillSupported ? "30d" : "none",
          customRefillDays: null,
          isDefault: false,
          isDefaultCategoryGlobal: false,
          isDefaultCategoryPlatform: false,
          providerProfileId,
          cpOwner: req.user._id,
        });
      } else {
        existingService.name          = service.name;
        existingService.category      = service.category;
        existingService.rate          = numericRate;
        existingService.lastSyncedRate = numericRate;
        existingService.min           = Number(service.min);
        existingService.max           = Number(service.max);
        existingService.providerApiUrl = apiUrl;
        existingService.providerApiKey = apiKey;
        existingService.refillAllowed  = refillSupported;
        existingService.cancelAllowed  = cancelSupported;
        existingService.serviceType    = serviceType; // ← keep in sync on re-import

        if (
          existingService.refillPolicy === "none" ||
          !existingService.refillPolicy
        ) {
          existingService.refillPolicy = refillSupported ? "30d" : "none";
        }

        await existingService.save();
      }

      count++;
    }

    // Flip childPanelServiceMode so end-users can see the imported services.
    // Preserves existing mode: none → own, platform → both, own/both → unchanged.
    const cpUser = await User.findById(req.user._id).select("childPanelServiceMode");
    const currentMode = cpUser?.childPanelServiceMode || "none";
    const newMode =
      currentMode === "none"     ? "own"  :
      currentMode === "platform" ? "both" :
      currentMode;

    if (newMode !== currentMode) {
      await User.findByIdAndUpdate(req.user._id, { childPanelServiceMode: newMode });
    }

    res.json({ message: "Selected services imported", count });
  } catch (error) {
    console.error("CP IMPORT SELECTED SERVICES ERROR:", error);
    res.status(500).json({ message: "Failed to import services" });
  }
};

// ======================= IMPORT BY CATEGORY =======================

export const importCPCategoryServices = async (req, res) => {
  try {
    const { category, services, provider } = req.body;

    if (!provider) {
      return res.status(400).json({ message: "provider required" });
    }
    if (!category) {
      return res.status(400).json({ message: "category required" });
    }
    if (!services || !Array.isArray(services)) {
      return res.status(400).json({ message: "services must be an array" });
    }

    const filtered = services.filter((s) => s.category === category);

    if (filtered.length === 0) {
      return res.json({ message: "No services found in this category", count: 0 });
    }

    req.body.services = filtered;

    return importCPSelectedServices(req, res);
  } catch (error) {
    console.error("CP IMPORT CATEGORY ERROR:", error);
    res.status(500).json({ message: "Failed to import category services" });
  }
};

// ======================= GET SAVED PROVIDER SERVICES =======================

export const getCPSavedProviderServices = async (req, res) => {
  try {
    const services = await ProviderService.find({ cpOwner: req.user._id })
      .sort({ category: 1, name: 1 });

    res.json(services);
  } catch (error) {
    console.error("CP GET SAVED SERVICES ERROR:", error);
    res.status(500).json({ message: "Failed to fetch services" });
  }
};

// ======================= TOGGLE PROVIDER SERVICE STATUS =======================

export const toggleCPProviderServiceStatus = async (req, res) => {
  try {
    const service = await ProviderService.findOne({
      _id: req.params.id,
      cpOwner: req.user._id,
    });

    if (!service) {
      return res.status(404).json({ message: "Service not found" });
    }

    service.status = !service.status;
    await service.save();

    await Service.updateMany(
      {
        providerServiceId: String(service.providerServiceId),
        cpOwner: req.user._id,
      },
      { status: service.status }
    );

    res.json(service);
  } catch (error) {
    console.error("CP TOGGLE PROVIDER SERVICE ERROR:", error);
    res.status(500).json({ message: "Failed to toggle service status" });
  }
};

// ======================= DELETE PROVIDER SERVICE =======================

export const deleteCPProviderService = async (req, res) => {
  try {
    const service = await ProviderService.findOne({
      _id: req.params.id,
      cpOwner: req.user._id,
    });

    if (!service) {
      return res.status(404).json({ message: "Service not found" });
    }

    await service.deleteOne();

    await Service.deleteMany({
      providerServiceId: String(service.providerServiceId),
      cpOwner: req.user._id,
    });

    res.json({ message: "Service deleted successfully" });
  } catch (error) {
    console.error("CP DELETE PROVIDER SERVICE ERROR:", error);
    res.status(500).json({ message: "Failed to delete service" });
  }
};
