// routes/adminLogRoutes.js
import express from "express";
import { getAdminLogs } from "../controllers/adminLogController.js";
import { protect } from "../middlewares/authMiddleware.js"; // ✅ correct
import { adminOnly } from "../middlewares/adminMiddleware.js";

const router = express.Router();

// ✅ Protected admin route
router.get("/", protect, adminOnly, getAdminLogs);

export default router;
