// routes/cpOwnerServiceRoutes.js
//
// Mounted at /api/cp/services in app.js
// All routes require: protect + childPanelOnly

import express from "express";
import {
  getCPServices,
  addCPService,
  updateCPService,
  deleteCPService,
  toggleCPServiceStatus,
  bulkToggleCPServices,
  bulkDeleteCPServices,
  getCPCommission,
  setCPCommission,
} from "../controllers/cpOwnerServiceController.js";

import { protect } from "../middlewares/authMiddleware.js";
import { childPanelOnly } from "../middlewares/adminMiddleware.js";

const router = express.Router();

router.use(protect, childPanelOnly);

// Commission
router.get("/commission", getCPCommission);
router.patch("/commission", setCPCommission);

// Bulk operations (must come before /:id routes)
router.patch("/bulk-toggle", bulkToggleCPServices);
router.delete("/bulk", bulkDeleteCPServices);

// CRUD
router.get("/", getCPServices);
router.post("/", addCPService);
router.put("/:id", updateCPService);
router.delete("/:id", deleteCPService);
router.patch("/:id/toggle", toggleCPServiceStatus);

export default router;
