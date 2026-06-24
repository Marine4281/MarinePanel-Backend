// routes/childPanelAdminRoutes.js

import express from "express";
import {
  getAllChildPanels,
  getChildPanelDetails,
  getChildPanelSettings,
  toggleChildPanelStatus,
  updateChildPanelBilling,
  resetChildPanelBilling, 
  updateChildPanelCommission,
  updateChildPanelOffer,
  updateChildPanelDefaultFees,
  deactivateChildPanel,
  updatePlatformResellerFeeOverride,
  creditChildPanelWallet,
} from "../controllers/childPanelAdminController.js";

import { protect } from "../middlewares/authMiddleware.js";
import { adminOnly } from "../middlewares/adminMiddleware.js";

const router = express.Router();

// List all child panels
router.get("/",                   protect, adminOnly, getAllChildPanels);

// Global default settings (fees + tiers)
router.get("/settings/fees",      protect, adminOnly, getChildPanelSettings);
router.put("/settings/fees",      protect, adminOnly, updateChildPanelDefaultFees);
router.post("/:id/credit-wallet", protect, adminOnly, creditChildPanelWallet); 

// Global offer/promo
router.put("/settings/offer",     protect, adminOnly, updateChildPanelOffer);
//RESET
router.put("/:id/billing/reset", protect, adminOnly, resetChildPanelBilling);

// Per-panel operations
router.get("/:id",                protect, adminOnly, getChildPanelDetails);
router.put("/:id/toggle-status",  protect, adminOnly, toggleChildPanelStatus);
router.put("/:id/billing",        protect, adminOnly, updateChildPanelBilling);
router.put("/:id/commission",     protect, adminOnly, updateChildPanelCommission);
router.delete("/:id",             protect, adminOnly, deactivateChildPanel);
router.patch("/:id/platform-reseller-fee", protect, adminOnly, updatePlatformResellerFeeOverride);

export default router;
