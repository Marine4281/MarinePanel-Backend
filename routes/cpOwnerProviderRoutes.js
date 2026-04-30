// routes/cpOwnerProviderRoutes.js

import express from "express";
import {
  getCPProviderProfiles,
  getCPProviderProfileById,
  createCPProviderProfile,
  updateCPProviderProfile,
  deleteCPProviderProfile,
  fetchCPProviderServices,
  importCPSelectedServices,
  importCPCategoryServices,
  getCPSavedProviderServices,
  toggleCPProviderServiceStatus,
  deleteCPProviderService,
} from "../controllers/cpOwnerProviderController.js";

const router = express.Router();

// Auth + childPanelOnly applied in app.js for this route group

// Provider profiles
router.get("/profiles", getCPProviderProfiles);
router.get("/profiles/:id", getCPProviderProfileById);
router.post("/profiles", createCPProviderProfile);
router.put("/profiles/:id", updateCPProviderProfile);
router.delete("/profiles/:id", deleteCPProviderProfile);

// Provider services
router.post("/services", fetchCPProviderServices);
router.get("/services/saved", getCPSavedProviderServices);
router.patch("/services/:id/toggle", toggleCPProviderServiceStatus);
router.delete("/services/:id", deleteCPProviderService);

// Import
router.post("/import-selected", importCPSelectedServices);
router.post("/import-category", importCPCategoryServices);

export default router;
