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
  importCPPlatformServices,
} from "../controllers/cpOwnerServiceController.js";

import {
  setCPServiceCommission,
  getCPCategoryCommissions,
  setCPCategoryCommission,
} from "../controllers/commissionOverrideController.js";

const router = express.Router();

// Commission (global CP rate)
router.get("/commission", getCPCommission);
router.patch("/commission", setCPCommission);

// Category commissions — BEFORE /:id
router.get("/category-commissions", getCPCategoryCommissions);
router.patch("/category-commissions", setCPCategoryCommission);

// Platform services
router.get("/platform", getCPPlatformServices);

// Rate changes + sync
router.get("/rate-changes", getCPRateChanges);
router.patch("/sync-all-rates", syncAllCPRates);

// Deleted sync
router.get("/deleted-sync", getCPDeletedSync);

// Bulk ops — before /:id
router.patch("/bulk-toggle", bulkToggleCPServices);
router.delete("/bulk", bulkDeleteCPServices);

// CRUD
router.get("/", getCPServices);
router.post("/", addCPService);
router.put("/:id", updateCPService);
router.delete("/:id", deleteCPService);
router.patch("/:id/toggle", toggleCPServiceStatus);
router.patch("/:id/sync-rate", syncCPServiceRate);

// Per-service commission override
router.patch("/:id/commission", setCPServiceCommission);

//importCPPlatformServices
router.post("/import-platform", importCPPlatformServices);

export default router;
