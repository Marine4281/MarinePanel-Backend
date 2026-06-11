import express from "express";
import {
  getCommission,
  updateCommission,
  resetRevenue,
  getResellerSettings,
  updateResellerSettings,
} from "../controllers/AdminSettingsController.js";
import {
  getMaintenanceSettings,
  updateMaintenanceSettings,
} from "../controllers/maintenanceController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.use(protect);

router.get("/commission", getCommission);
router.put("/commission", updateCommission);

router.get("/reseller", getResellerSettings);
router.put("/reseller", updateResellerSettings);

router.post("/reset-revenue", resetRevenue);

// Maintenance
router.get("/maintenance", getMaintenanceSettings);
router.put("/maintenance", updateMaintenanceSettings);

export default router;
