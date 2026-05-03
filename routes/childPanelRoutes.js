// routes/childPanelRoutes.js

import express from "express";
import {
  getChildPanelActivationFee,
  activateChildPanel,
  getChildPanelDashboard,
  getChildPanelResellers,
  getChildPanelUsers,
  getChildPanelOrders,
  updateChildPanelResellerCommission,
  toggleChildPanelResellerStatus,
  updateChildPanelBranding,
  updateChildPanelDomain,
  updateChildPanelSettings,
  getChildPanelBranding,           // ← was missing
} from "../controllers/childPanelController.js";

import { protect } from "../middlewares/authMiddleware.js";
import { childPanelOnly } from "../middlewares/adminMiddleware.js";

const router = express.Router();

// Public — show activation fee before login
router.get("/activation-fee", getChildPanelActivationFee);

// Public — child panel domain branding (used by ChildPanelContext on frontend)
router.get("/branding", getChildPanelBranding);

// Activate
router.post("/activate", protect, activateChildPanel);

// Dashboard
router.get("/dashboard", protect, childPanelOnly, getChildPanelDashboard);

// Resellers
router.get("/resellers", protect, childPanelOnly, getChildPanelResellers);
router.put("/resellers/:id/toggle-status", protect, childPanelOnly, toggleChildPanelResellerStatus);
router.put("/resellers/:id/commission", protect, childPanelOnly, updateChildPanelResellerCommission);

// Users
router.get("/users", protect, childPanelOnly, getChildPanelUsers);

// Orders
router.get("/orders", protect, childPanelOnly, getChildPanelOrders);

// Branding (owner update)
router.put("/branding", protect, childPanelOnly, updateChildPanelBranding);

// Domain
router.put("/domain", protect, childPanelOnly, updateChildPanelDomain);

// Settings
router.put("/settings", protect, childPanelOnly, updateChildPanelSettings);

export default router;
