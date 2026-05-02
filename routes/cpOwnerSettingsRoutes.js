// routes/cpOwnerSettingsRoutes.js

import express from "express";
import {
  getCPSettings,
  updateCPBranding,
  updateCPSupportLinks,
  updateCPResellerFees,
  updateCPPaymentMode,
  updateCPServiceMode,
  updateCPDomain,
  updateCPTemplate,
} from "../controllers/cpOwnerSettingsController.js";

const router = express.Router();

// Auth + childPanelOnly applied in app.js for this route group

// Get all settings in one call
router.get("/", getCPSettings);

// Individual update endpoints
router.put("/branding", updateCPBranding);
router.put("/support", updateCPSupportLinks);
router.put("/reseller-fees", updateCPResellerFees);
router.put("/payment-mode", updateCPPaymentMode);
router.put("/service-mode", updateCPServiceMode);
router.put("/domain", updateCPDomain);
router.put("/template", updateCPTemplate);

export default router;
