import express from "express";
import {
  activateReseller,
  getActivationFee,
  getResellerDashboard,
  getResellerUsers,
  getResellerOrders,
  withdrawResellerFunds,
  getBranding,
  updateBranding,
} from "../controllers/resellerController.js";

import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

/*
--------------------------------
Get Reseller Activation Fee
Used on activation screen
--------------------------------
*/
router.get("/activation-fee", protect, getActivationFee);

/*
--------------------------------
Activate Reseller
User pays activation fee then activates
--------------------------------
*/
router.post("/activate", protect, activateReseller);

/*
--------------------------------
Reseller Dashboard
--------------------------------
*/
router.get("/dashboard", protect, getResellerDashboard);

/*
--------------------------------
Reseller Users
--------------------------------
*/
router.get("/users", protect, getResellerUsers);

/*
--------------------------------
Reseller Orders
--------------------------------
*/
router.get("/orders", protect, getResellerOrders);

/*
--------------------------------
Withdraw Earnings
--------------------------------
*/
router.post("/withdraw", protect, withdrawResellerFunds);

/*
--------------------------------
Get Branding (for landing page)
--------------------------------
*/
router.get("/branding", getBranding); // no auth needed for public landing

/*
--------------------------------
Update Branding
--------------------------------
*/
router.patch("/branding", protect, updateBranding);

export default router;
