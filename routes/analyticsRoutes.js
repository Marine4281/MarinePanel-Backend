// routes/analyticsRoutes.js

import express from "express";
import {
  getOverview,
  getTimeseries,
  getTopPages,
  getTrafficSources,
  getRealtimeUsers,
} from "../controllers/analyticsController.js";
import { adminOnly } from "../middlewares/adminMiddleware.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

// Admin-only — Google Analytics (GA4) reporting
router.use(protect, adminOnly);

router.get("/overview", getOverview);
router.get("/timeseries", getTimeseries);
router.get("/top-pages", getTopPages);
router.get("/traffic-sources", getTrafficSources);
router.get("/realtime", getRealtimeUsers);

export default router;
