//routes//adminLogRoutes.js
import express from "express";
import { getAdminLogs } from "../controllers/adminLogController.js";
import authMiddleware from "../middlewares/authMiddleware.js";
import roleMiddleware from "../middlewares/roleMiddleware.js";

const router = express.Router();

// Only admins
router.get("/", authMiddleware, roleMiddleware("admin"), getAdminLogs);

export default router;
