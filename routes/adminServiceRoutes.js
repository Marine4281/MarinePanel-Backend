//routes/adminServiceRoutes.js
import express from "express";
import {
  getAllServices,
  addService,
  updateService,
  deleteService,
  toggleServiceStatus,
} from "../controllers/adminServiceControllers.js";

import {
  toggleRefillGlobal,
  toggleCancelGlobal,
  getServiceSettings,
} from "../controllers/serviceTogglesController.js";

import { protect } from "../middlewares/authMiddleware.js";
import { adminOnly } from "../middlewares/adminMiddleware.js";

const router = express.Router();

// All routes protected and admin-only
router.use(protect, adminOnly);

// 🔥 GLOBAL TOGGLES FIRST (IMPORTANT)
router.patch("/toggle-refill-global", toggleRefillGlobal);
router.patch("/toggle-cancel-global", toggleCancelGlobal);
router.get("/service-settings", getServiceSettings);

// GET all services
router.get("/", getAllServices);

// Toggle visibility 
router.patch("/:id/toggle", toggleServiceStatus);

// POST add new service
router.post("/", addService);

// PUT update service by id
router.put("/:id", updateService);

// DELETE service by id
router.delete("/:id", deleteService);

export default router;
