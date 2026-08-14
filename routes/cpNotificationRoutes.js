// routes/cpNotificationRoutes.js
import express from "express";
import {
  getCPNotifications,
  createCPNotification,
  updateCPNotification,
  deleteCPNotification,
} from "../controllers/cpNotificationController.js";

const router = express.Router();

// Auth + cpOwnerOnly applied in app.js

router.get("/", getCPNotifications);
router.post("/", createCPNotification);
router.put("/:id", updateCPNotification);
router.delete("/:id", deleteCPNotification);

export default router;
