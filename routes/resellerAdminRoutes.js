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
import { adminOnly } from "../middlewares/adminMiddleware.js";

const router = express.Router();

// Admin-only reseller management
router.get("/", protect, adminOnly, getAllResellers);
router.get("/:id", protect, adminOnly, getResellerDetails);

router.put("/:id/commission", protect, adminOnly, updateResellerCommission);
router.put("/:id/toggle-status", protect, adminOnly, toggleResellerStatus);

router.get("/:id/users", protect, adminOnly, getResellerUsers);
router.get("/:id/orders", protect, adminOnly, getResellerOrders);

export default router;
