//controllers/ProviderProfileController.js
import ProviderProfile from "../models/ProviderProfile.js";

/* =========================================================
CREATE PROVIDER PROFILE
========================================================= */
export const createProviderProfile = async (req, res) => {
  try {
    const { name, apiUrl, apiKey } = req.body;

    if (!name || !apiUrl || !apiKey) {
      return res.status(400).json({
        message: "Name, API URL and API Key are required",
      });
    }

    // Prevent duplicate provider names
    const existing = await ProviderProfile.findOne({ name });

    if (existing) {
      return res.status(400).json({
        message: "Provider already exists",
      });
    }

    const provider = await ProviderProfile.create({
      name,
      apiUrl,
      apiKey,
    });

    res.status(201).json({
      message: "Provider created successfully",
      provider,
    });

  } catch (error) {
    console.error("CREATE PROVIDER ERROR:", error);
    res.status(500).json({
      message: "Failed to create provider",
      error: error.message,
    });
  }
};

/* =========================================================
GET ALL PROVIDERS
========================================================= */
export const getProviderProfiles = async (req, res) => {
  try {
    const providers = await ProviderProfile.find()
      .sort({ createdAt: -1 })
      .lean();

    res.json(providers);

  } catch (error) {
    console.error("GET PROVIDERS ERROR:", error);
    res.status(500).json({
      message: "Failed to fetch providers",
      error: error.message,
    });
  }
};

/* =========================================================
GET SINGLE PROVIDER
========================================================= */
export const getProviderProfileById = async (req, res) => {
  try {
    const provider = await ProviderProfile.findById(req.params.id);

    if (!provider) {
      return res.status(404).json({
        message: "Provider not found",
      });
    }

    res.json(provider);

  } catch (error) {
    console.error("GET PROVIDER ERROR:", error);
    res.status(500).json({
      message: "Failed to fetch provider",
      error: error.message,
    });
  }
};

/* =========================================================
UPDATE PROVIDER
========================================================= */
export const updateProviderProfile = async (req, res) => {
  try {
    const { name, apiUrl, apiKey } = req.body;

    const provider = await ProviderProfile.findById(req.params.id);

    if (!provider) {
      return res.status(404).json({
        message: "Provider not found",
      });
    }

    // Prevent duplicate name (if changed)
    if (name && name !== provider.name) {
      const existing = await ProviderProfile.findOne({ name });
      if (existing) {
        return res.status(400).json({
          message: "Provider name already exists",
        });
      }
    }

    provider.name = name || provider.name;
    provider.apiUrl = apiUrl || provider.apiUrl;
    provider.apiKey = apiKey || provider.apiKey;

    await provider.save();

    res.json({
      message: "Provider updated successfully",
      provider,
    });

  } catch (error) {
    console.error("UPDATE PROVIDER ERROR:", error);
    res.status(500).json({
      message: "Failed to update provider",
      error: error.message,
    });
  }
};

/* =========================================================
DELETE PROVIDER
========================================================= */
export const deleteProviderProfile = async (req, res) => {
  try {
    const provider = await ProviderProfile.findById(req.params.id);

    if (!provider) {
      return res.status(404).json({
        message: "Provider not found",
      });
    }

    await provider.deleteOne();

    res.json({
      message: "Provider deleted successfully",
    });

  } catch (error) {
    console.error("DELETE PROVIDER ERROR:", error);
    res.status(500).json({
      message: "Failed to delete provider",
      error: error.message,
    });
  }
};
