// routes/cpOwnerResellerRoutes.js

import express from "express";
import {
  getCPResellers,
  getCPResellerDetails,
  toggleCPResellerStatus,
  updateCPResellerCommission,
  updateCPResellerBalance,
  getCPResellerUsers,
  getCPResellerOrders,
} from "../controllers/cpOwnerResellerController.js";

const router = express.Router();

// Auth + childPanelOnly applied in app.js for this route group

router.get("/", getCPResellers);
router.get("/:id", getCPResellerDetails);

router.put("/:id/commission", updateCPResellerCommission);
router.put("/:id/toggle-status", toggleCPResellerStatus);
router.put("/:id/balance", updateCPResellerBalance);

router.get("/:id/users", getCPResellerUsers);
router.get("/:id/orders", getCPResellerOrders);

export default router;
