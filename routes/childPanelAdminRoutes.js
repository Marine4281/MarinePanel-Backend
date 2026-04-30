// routes/childPanelAdminRoutes.js

import express from "express";
import {
  getAllChildPanels,
  getChildPanelDetails,
  toggleChildPanelStatus,
  updateChildPanelBilling,
  updateChildPanelCommission,
  updateChildPanelOffer,
  updateChildPanelDefaultFees,
  deactivateChildPanel,
} from "../controllers/childPanelAdminController.js";

import { protect } from "../middlewares/authMiddleware.js";
import { adminOnly } from "../middlewares/adminMiddleware.js";

const router = express.Router();

/*
--------------------------------
List all child panels
--------------------------------
*/
router.get("/", protect, adminOnly, getAllChildPanels);

/*
--------------------------------
Child panel details
--------------------------------
*/
router.get("/:id", protect, adminOnly, getChildPanelDetails);

/*
--------------------------------
Toggle suspend / activate
--------------------------------
*/
router.put("/:id/toggle-status", protect, adminOnly, toggleChildPanelStatus);

/*
--------------------------------
Override billing for specific panel
--------------------------------
*/
router.put("/:id/billing", protect, adminOnly, updateChildPanelBilling);

/*
--------------------------------
Set commission for specific panel
--------------------------------
*/
router.put("/:id/commission", protect, adminOnly, updateChildPanelCommission);

/*
--------------------------------
Deactivate / remove child panel
--------------------------------
*/
router.delete("/:id", protect, adminOnly, deactivateChildPanel);

/*
--------------------------------
Global default fees for all new child panels
--------------------------------
*/
router.put("/settings/fees", protect, adminOnly, updateChildPanelDefaultFees);

/*
--------------------------------
Offer / promo toggle
--------------------------------
*/
router.put("/settings/offer", protect, adminOnly, updateChildPanelOffer);

export default router;
