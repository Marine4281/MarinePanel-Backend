//routes/resellerAdminRoutes.js
import express from "express";
import {
  getAllResellers,
  getResellerDetails,
  updateResellerCommission,
  toggleResellerStatus,
  getResellerUsers,
  getResellerOrders,
} from "../controllers/resellerAdminController.js";

import { protect, admin } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", protect, admin, getAllResellers);
router.get("/:id", protect, admin, getResellerDetails);

router.put("/:id/commission", protect, admin, updateResellerCommission);
router.put("/:id/toggle-status", protect, admin, toggleResellerStatus);

router.get("/:id/users", protect, admin, getResellerUsers);
router.get("/:id/orders", protect, admin, getResellerOrders);

export default router;
