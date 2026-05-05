// routes/cpOwnerServiceRoutes.js

import express from "express";
import {
  getCPServices,
  getCPPlatformServices,
  addCPService,
  updateCPService,
  deleteCPService,
  toggleCPServiceStatus,
  bulkToggleCPServices,
  bulkDeleteCPServices,
  getCPCommission,
  setCPCommission,
  getCPRateChanges,
  syncCPServiceRate,
  syncAllCPRates,
  getCPDeletedSync,
} from "../controllers/cpOwnerServiceController.js";

const router = express.Router();

// Commission
router.get("/commission", getCPCommission);
router.patch("/commission", setCPCommission);

// Platform services (main admin published)
router.get("/platform", getCPPlatformServices);

// Rate changes + sync
router.get("/rate-changes", getCPRateChanges);
router.patch("/sync-all-rates", syncAllCPRates);

// Deleted services sync
router.get("/deleted-sync", getCPDeletedSync);

// Bulk operations — must be before /:id
router.patch("/bulk-toggle", bulkToggleCPServices);
router.delete("/bulk", bulkDeleteCPServices);

// CRUD
router.get("/", getCPServices);
router.post("/", addCPService);
router.put("/:id", updateCPService);
router.delete("/:id", deleteCPService);
router.patch("/:id/toggle", toggleCPServiceStatus);
router.patch("/:id/sync-rate", syncCPServiceRate);

export default router;
