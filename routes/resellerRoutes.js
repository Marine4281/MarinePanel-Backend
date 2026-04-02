
// routes/resellerRoutes.js

import express from "express";
import {
  activateReseller,
  getActivationFee,
  getResellerDashboard,
  getResellerUsers,
  getResellerOrders,
  withdrawResellerFunds,
  switchResellerDomain, 
} from "../controllers/resellerController.js";

import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

/*
--------------------------------
Get Reseller Activation Fee
--------------------------------
*/
router.get("/activation-fee", protect, getActivationFee);

/*
--------------------------------
Activate Reseller
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
Switch Domain (FIXED PATH ✅)
--------------------------------
*/
router.post("/switch-domain", protect, switchResellerDomain);

/*
--------------------------------
Withdraw Earnings
--------------------------------
*/
router.post("/withdraw", protect, withdrawResellerFunds);

export default router;
