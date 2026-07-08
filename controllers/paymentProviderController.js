// controllers/paymentProviderController.js
import PaymentProvider from "../models/PaymentProvider.js";
import PaymentGateway  from "../models/PaymentGateway.js";
import { getProvidersMeta } from "../utils/gateways/index.js";
import { encryptCredentials, decryptCredentials } from "../utils/encryptCredentials.js";
import { safeProvider } from "../utils/gatewayHelpers.js";

// ─── PUBLIC: GET PROVIDERS META ──────────────────────────────────────
export const getProviders = (_req, res) => {
  res.json({ providers: getProvidersMeta() });
};

// ─── CP OWNER: GET AVAILABLE PLATFORM PROVIDERS ──────────────────────
export const getCpAvailableProviders = async (req, res) => {
  try {
    const providers = await PaymentProvider.find({
      owner:       null,
      isActive:    true,
      visibleToCp: true,
    }).select("name providerType"); // never return credentials

    res.json({ providers });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch providers" });
  }
};

// ─── ADMIN: PROVIDER CRUD ─────────────────────────────────────────────
export const adminGetProviders = async (req, res) => {
  try {
    const providers = await PaymentProvider.find({ owner: null }).sort({ createdAt: -1 });
    res.json({ providers: providers.map(safeProvider) });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch providers" });
  }
};

export const adminCreateProvider = async (req, res) => {
  try {
    const { name, providerType, credentials: raw, isActive } = req.body;
    if (!name || !providerType) {
      return res.status(400).json({ message: "name and providerType required" });
    }

    const provider = await PaymentProvider.create({
      owner:       null,
      name,
      providerType,
      isActive:    isActive !== false,
      credentials: encryptCredentials(raw || {}),
    });

    res.status(201).json({ message: "Provider created", provider: safeProvider(provider) });
  } catch (err) {
    console.error("adminCreateProvider error:", err);
    res.status(500).json({ message: "Failed to create provider" });
  }
};

export const adminUpdateProvider = async (req, res) => {
  try {
    const provider = await PaymentProvider.findOne({ _id: req.params.id, owner: null });
    if (!provider) return res.status(404).json({ message: "Provider not found" });

    if (req.body.name)     provider.name     = req.body.name;
    if (req.body.isActive !== undefined) provider.isActive = req.body.isActive;
    if (req.body.visibleToCp !== undefined) provider.visibleToCp = req.body.visibleToCp;

    if (req.body.credentials) {
      const existing = decryptCredentials(provider.credentials);
      const merged   = { ...existing, ...req.body.credentials };
      provider.credentials = encryptCredentials(merged);
    }

    await provider.save();
    res.json({ message: "Provider updated", provider: safeProvider(provider) });
  } catch (err) {
    res.status(500).json({ message: "Failed to update provider" });
  }
};

export const adminDeleteProvider = async (req, res) => {
  try {
    // Check if any gateway uses this provider
    const inUse = await PaymentGateway.findOne({ providerProfile: req.params.id });
    if (inUse) {
      return res.status(400).json({
        message: "Cannot delete — provider is used by one or more gateways",
      });
    }
    await PaymentProvider.findOneAndDelete({ _id: req.params.id, owner: null });
    res.json({ message: "Provider deleted" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete provider" });
  }
};
