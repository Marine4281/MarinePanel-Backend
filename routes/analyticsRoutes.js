// routes/analyticsRoutes.js

import express from "express";
import {
  getOverview,
  getTimeseries,
  getTopPages,
  getTopQueries,
} from "../controllers/analyticsController.js";
import { adminOnly } from "../middlewares/adminMiddleware.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

// Admin-only — Google Search Console reporting
router.use(protect, adminOnly);

router.get("/overview", getOverview);
router.get("/timeseries", getTimeseries);
router.get("/top-pages", getTopPages);
router.get("/top-queries", getTopQueries);

export default router;
