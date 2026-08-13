// routes/adminNotificationRoutes.js
import express from "express";
import { authMiddleware } from "../middlewares/authMiddleware.js"; // adjust to your actual export name if different
import { adminOnly } from "../middlewares/adminMiddleware.js";
import {
  getNotifications,
  createNotification,
  updateNotification,
  deleteNotification,
} from "../controllers/notificationController.js";

const router = express.Router();

router.get("/", getNotifications);
router.post("/", createNotification);
router.put("/:id", updateNotification);
router.delete("/:id", deleteNotification);

export default router;
