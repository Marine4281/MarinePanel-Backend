// routes/adminServiceRoutes.js
import express from "express";
import {
  getAllServices,
  addService,
  updateService,
  deleteService,
  toggleServiceStatus,
  toggleAvailableToChildPanels,
} from "../controllers/adminServiceControllers.js";

import {
  toggleRefillGlobal,
  toggleCancelGlobal,
  getServiceSettings,
} from "../controllers/serviceTogglesController.js";

import {
  setServiceCommission,
  getCategoryCommissions,
  setCategoryCommission,
} from "../controllers/commissionOverrideController.js";

import { protect } from "../middlewares/authMiddleware.js";
import { adminOnly } from "../middlewares/adminMiddleware.js";

const router = express.Router();

router.use(protect, adminOnly);

// Global toggles
router.patch("/toggle-refill-global", toggleRefillGlobal);
router.patch("/toggle-cancel-global", toggleCancelGlobal);
router.get("/service-settings", getServiceSettings);

// Category commissions — BEFORE /:id to avoid conflicts
router.get("/category-commissions", getCategoryCommissions);
router.patch("/category-commissions", setCategoryCommission);

// CRUD
router.get("/", getAllServices);
router.post("/", addService);
router.put("/:id", updateService);
router.delete("/:id", deleteService);
router.patch("/:id/toggle", toggleServiceStatus);

// Per-service commission override
router.patch("/:id/commission", setServiceCommission);

//Toggle Available To ChildPanels
router.patch("/:id/toggle-cp", toggleAvailableToChildPanels);

export default router;
