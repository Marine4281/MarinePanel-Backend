import express from "express";
import {
  getUsers,
  getStats,
  getRevenueTrend,
  getTopPerformers,
} from "../controllers/adminController.js";
import { protect } from "../middlewares/authMiddleware.js";
import { adminOnly } from "../middlewares/adminMiddleware.js";

const router = express.Router();

// Only admin users can access these routes
router.use(protect, adminOnly);

// Admin routes
router.get("/users", getUsers);                    // Get all users
router.get("/stats", getStats);                     // Get stats + revenue + recent orders
router.get("/revenue-trend", getRevenueTrend);       // Revenue trend chart data
router.get("/top-performers", getTopPerformers);     // Top platforms/categories/services

export default router;
