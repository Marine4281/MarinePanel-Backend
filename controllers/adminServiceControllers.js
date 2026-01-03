// controllers/AdminService.js
import Service from "../models/Service.js";

/**
 * GET /api/admin/services
 * Get all services
 */
export const getAllServices = async (req, res) => {
  try {
    const services = await Service.find().sort({ createdAt: -1 });
    res.json(services);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch services" });
  }
};

/**
 * POST /api/admin/services
 * Add a new service
 */
export const addService = async (req, res) => {
  try {
    // If new service is marked default, unset default for other services in same category
    if (req.body.isDefault && req.body.category) {
      await Service.updateMany(
        { category: req.body.category },
        { isDefault: false }
      );
    }

    const service = await Service.create(req.body);
    res.status(201).json(service);
  } catch (err) {
    res.status(500).json({ message: "Failed to add service" });
  }
};

/**
 * PUT /api/admin/services/:id
 * Update a service
 */
export const updateService = async (req, res) => {
  try {
    // If updated service is marked default, unset default for other services in same category
    if (req.body.isDefault && req.body.category) {
      await Service.updateMany(
        { category: req.body.category, _id: { $ne: req.params.id } },
        { isDefault: false }
      );
    }

    const service = await Service.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    res.json(service);
  } catch (err) {
    res.status(500).json({ message: "Failed to update service" });
  }
};

/**
 * DELETE /api/admin/services/:id
 * Delete a service
 */
export const deleteService = async (req, res) => {
  try {
    await Service.findByIdAndDelete(req.params.id);
    res.json({ message: "Service deleted" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete service" });
  }
};

/**
 * GET /api/admin/services/categories
 * Fetch unique categories
 */
export const getCategories = async (req, res) => {
  try {
    const categories = await Service.distinct("category");
    res.json(categories);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch categories" });
  }
};

/**
 * GET /api/admin/services/providers
 * Fetch unique providers
 */
export const getProviders = async (req, res) => {
  try {
    const providers = await Service.distinct("provider");
    res.json(providers);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch providers" });
  }
};