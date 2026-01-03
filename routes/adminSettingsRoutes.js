import express from "express";
import {
  getCommission,
  updateCommission,
  resetRevenue,
} from "../controllers/AdminSettingsController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.use(protect); // only authenticated admins can access
router.get("/commission", getCommission);
router.put("/commission", updateCommission);
router.post("/reset-revenue", resetRevenue);

export default router;