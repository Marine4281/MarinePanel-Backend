// routes/resellerAdminRoutes.js
import express from "express";
import {
  getAllResellers,
  getResellerDetails,
  updateResellerCommission,
  toggleResellerStatus,
  getResellerUsers,
  getResellerOrders,
} from "../controllers/resellerAdminController.js";

// ✅ Correct middleware imports
import { protect } from "../middlewares/authMiddleware.js";
import { adminProtect } from "../middlewares/adminMiddleware.js";

const router = express.Router();

// Admin-only reseller management
router.get("/", protect, adminProtect, getAllResellers);
router.get("/:id", protect, adminProtect, getResellerDetails);

router.put("/:id/commission", protect, adminProtect, updateResellerCommission);
router.put("/:id/toggle-status", protect, adminProtect, toggleResellerStatus);

router.get("/:id/users", protect, adminProtect, getResellerUsers);
router.get("/:id/orders", protect, adminProtect, getResellerOrders);

export default router;
