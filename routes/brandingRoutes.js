// routes/brandingRoutes.js

import express from "express";

import {
  getPublicBranding,
  updateBranding,
  updateResellerLandingTemplate,
  getDashboardBranding,
} from "../controllers/brandingController.js";

import { protect } from "../middlewares/authMiddleware.js";
import { resellerOnly } from "../middlewares/resellerMiddleware.js";
import { detectResellerDomain } from "../middlewares/resellerDomainMiddleware.js";

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
router.get(
  "/public",
  detectResellerDomain,
  getPublicBranding
);

/*
--------------------------------
🔐 DASHBOARD BRANDING (LOGGED-IN)
--------------------------------
- Used ONLY inside reseller dashboard
- Requires authentication
- Uses req.user (NOT domain)
--------------------------------
*/
router.get(
  "/dashboard",
  protect,
  getDashboardBranding
);

/*
--------------------------------
🖼️ UPDATE LANDING TEMPLATE
--------------------------------
- Reseller only
--------------------------------
*/
router.put(
  "/landing-template",
  protect,
  resellerOnly,
  updateResellerLandingTemplate
);

/*
--------------------------------
✏️ UPDATE BRANDING
--------------------------------
- Updates reseller branding
- Used in dashboard settings
--------------------------------
*/
router.patch(
  "/",
  protect,
  resellerOnly,
  updateBranding
);

export default router;
