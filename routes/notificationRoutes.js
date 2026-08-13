// routes/notificationRoutes.js
import express from "express";
import { protect } from "../middlewares/authMiddleware.js";
import {
  getActiveNotification,
  dismissNotification,
} from "../controllers/notificationController.js";

const router = express.Router();

router.use(protect); // must be logged in

router.get("/active", getActiveNotification);
router.post("/:id/dismiss", dismissNotification);

export default router;
