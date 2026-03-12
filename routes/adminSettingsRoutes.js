import express from "express";
import {
  getCommission,
  updateCommission,
  resetRevenue,
  getResellerSettings,
  updateResellerSettings,
} from "../controllers/AdminSettingsController.js";

import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.use(protect); // only authenticated admins can access

/*
--------------------------------
Commission Settings
--------------------------------
*/
router.get("/commission", getCommission);
router.put("/commission", updateCommission);

/*
--------------------------------
Reseller Platform Settings
--------------------------------
*/
router.get("/reseller", getResellerSettings);
router.put("/reseller", updateResellerSettings);

/*
--------------------------------
Reset Revenue
--------------------------------
*/
router.post("/reset-revenue", resetRevenue);

export default router;
