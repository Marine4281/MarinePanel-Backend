import express from "express";
import { getUsers, getOrders, getStats } from "../controllers/adminController.js";
import { protect } from "../middlewares/authMiddleware.js";
import { adminOnly } from "../middlewares/adminMiddleware.js";

const router = express.Router();

// Only admin users can access these routes
router.use(protect, adminOnly);

// Admin routes
router.get("/users", getUsers);            // Get all users
router.get("/orders", getOrders);          // Get orders separately if needed
router.get("/stats", getStats);            // Get stats + revenue + recent orders

export default router;
