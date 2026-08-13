// routes/adminNotificationRoutes.js
import express from "express";
import { protect } from "../middlewares/authMiddleware.js";
import { adminOnly } from "../middlewares/adminMiddleware.js";
import {
  getNotifications,
  createNotification,
  updateNotification,
  deleteNotification,
} from "../controllers/notificationController.js";

const router = express.Router();

router.use(protect, adminOnly);

router.get("/", getNotifications);
router.post("/", createNotification);
router.put("/:id", updateNotification);
router.delete("/:id", deleteNotification);

export default router;
