// routes/brandingRoutes.js

import express from "express";
import {
  getPublicBranding,
  getDashboardBranding
} from "../controllers/brandingController.js";

import { updateBranding } from "../controllers/resellerController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

/*
--------------------------------
🌍 PUBLIC BRANDING (DOMAIN-BASED)
--------------------------------
- Used by:
  • Main site
  • Reseller subdomains
  • Custom domains
- NO authentication required
- Uses resellerDomainMiddleware (req.brand)
--------------------------------
*/
router.get("/public", getPublicBranding);

/*
--------------------------------
🔐 DASHBOARD BRANDING (LOGGED-IN)
--------------------------------
- Used ONLY inside reseller dashboard
- Requires authentication
- Uses req.user (NOT domain)
--------------------------------
*/
router.get("/dashboard", protect, getDashboardBranding);

/*
--------------------------------
✏️ UPDATE BRANDING (RESELLER ONLY)
--------------------------------
- Updates reseller branding in DB
- Used in dashboard settings page
--------------------------------
*/
router.patch("/", protect, updateBranding);

export default router;
