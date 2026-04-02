import express from "express";
import { getAdminLogs } from "../controllers/adminLogController.js";
import authMiddleware from "../middlewares/authMiddleware.js";
import { adminOnly } from "../middlewares/adminMiddleware.js"; // ✅ FIX

const router = express.Router();

// ✅ Only admins
router.get("/", authMiddleware, adminOnly, getAdminLogs);

export default router;
