// routes/brandingRoutes.js

import express from "express";

import {
  getPublicBranding,
  updateBranding,
  updateResellerLandingTemplate,
  getDashboardBranding,
} from "../controllers/brandingController.js";

import { protect } from "../middlewares/authMiddleware.js";
import { detectResellerDomain } from "../middlewares/resellerDomainMiddleware.js";

const router = express.Router();

/*
--------------------------------
🌍 PUBLIC BRANDING (DOMAIN-BASED)
--------------------------------
*/
router.get(
  "/public",
  detectResellerDomain,
  getPublicBranding
);

/*
--------------------------------
🔐 DASHBOARD BRANDING
--------------------------------
*/
router.get(
  "/dashboard",
  protect,
  getDashboardBranding
);

/*
--------------------------------
🖼️ LANDING TEMPLATE (RESELLER ONLY)
FIX 3: removed wrong childPanelOnly middleware
FIX 4: changed put → patch to match frontend API.patch() call
--------------------------------
*/
router.patch(
  "/landing-template",
  protect,
  updateResellerLandingTemplate
);

/*
--------------------------------
✏️ UPDATE BRANDING (RESELLER ONLY)
--------------------------------
*/
router.patch(
  "/",
  protect,
  updateBranding
);

export default router;
