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
import { childPanelOnly } from "../middlewares/adminMiddleware.js";

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
🖼️ LANDING TEMPLATE
(CHILD PANEL OWNER ONLY)
--------------------------------
*/
router.put(
  "/landing-template",
  protect,
  childPanelOnly,
  updateResellerLandingTemplate
);

/*
--------------------------------
✏️ UPDATE BRANDING
(CHILD PANEL OWNER ONLY)
--------------------------------
*/
router.patch(
  "/",
  protect,
  childPanelOnly,
  updateBranding
);

export default router;
