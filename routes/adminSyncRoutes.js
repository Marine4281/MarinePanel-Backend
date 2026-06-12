// routes/adminSyncRoutes.js

import express from "express";
import { protect } from "../middlewares/authMiddleware.js";
import { adminOnly } from "../middlewares/adminMiddleware.js";
import {
  getSyncOrders, pauseSyncOrder, resumeSyncOrder, stopSyncOrder, forceCheckOrder,
  getSyncRefills, pauseRefill, resumeRefill, stopRefill, forceCheckRefill,
  getSyncCancels,
} from "../controllers/adminSyncController.js";

const router = express.Router();
router.use(protect, adminOnly);

// Orders
router.get("/orders",                   getSyncOrders);
router.post("/orders/:id/pause",        pauseSyncOrder);
router.post("/orders/:id/resume",       resumeSyncOrder);
router.post("/orders/:id/stop",         stopSyncOrder);
router.post("/orders/:id/force-check",  forceCheckOrder);

// Refills
router.get("/refills",                  getSyncRefills);
router.post("/refills/:id/pause",       pauseRefill);
router.post("/refills/:id/resume",      resumeRefill);
router.post("/refills/:id/stop",        stopRefill);
router.post("/refills/:id/force-check", forceCheckRefill);

// Cancels (read-only log)
router.get("/cancels", getSyncCancels);

export default router;
