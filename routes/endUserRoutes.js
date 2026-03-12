// routes/endUserRoutes.js
import express from "express";
import {
  getEndUserDashboard,
  getEndUserOrders,
  getResellerBranding,
} from "../controllers/endUserController.js";
import { protect } from "../middlewares/authMiddleware.js"; // make sure you have your auth middleware

const router = express.Router();

/*
--------------------------------
End User Dashboard
GET /api/end-user/dashboard
--------------------------------
*/
router.get("/dashboard", protect, getEndUserDashboard);

/*
--------------------------------
End User Orders
GET /api/end-user/orders
--------------------------------
*/
router.get("/orders", protect, getEndUserOrders);

/*
--------------------------------
End User Branding (from Reseller)
GET /api/end-user/branding
--------------------------------
*/
router.get("/branding", protect, getResellerBranding);

export default router;
