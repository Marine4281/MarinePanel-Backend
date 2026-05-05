// routes/cpOwnerServiceRoutes.js
// Mount at: app.use("/api/cp/services", authMiddleware, cpOwnerOnly, updateLastSeen, cpOwnerServiceRoutes)

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
} from "../controllers/cpOwnerServiceController.js";

const router = express.Router();

// Commission
router.get("/commission", getCPCommission);
router.patch("/commission", setCPCommission);

// Platform services (main admin published services, with admin commission applied)
router.get("/platform", getCPPlatformServices);

// Bulk operations — must be before /:id
router.patch("/bulk-toggle", bulkToggleCPServices);
router.delete("/bulk", bulkDeleteCPServices);

// CRUD
router.get("/", getCPServices);
router.post("/", addCPService);
router.put("/:id", updateCPService);
router.delete("/:id", deleteCPService);
router.patch("/:id/toggle", toggleCPServiceStatus);

export default router;
