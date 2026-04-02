import express from "express";
import { getAdminLogs } from "../controllers/adminLogController.js";
import authMiddleware from "../middlewares/authMiddleware.js";
import adminMiddleware from "../middlewares/adminMiddleware.js"; // ✅ use this

const router = express.Router();

// ✅ Only authenticated admins can access
router.get("/", authMiddleware, adminMiddleware, getAdminLogs);

export default router;
