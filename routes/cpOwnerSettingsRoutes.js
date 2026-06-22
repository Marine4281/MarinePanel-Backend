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
  updateCPLandingTemplate,
  updateCPAutoDeduct,
  payBillingFee,
} from "../controllers/cpOwnerSettingsController.js";

import { protect } from "../middlewares/authMiddleware.js";
import { cpOwnerOnly } from "../middlewares/childPanelMiddleware.js";

const router = express.Router();

/*
----------------------------------------------------
CHILD PANEL OWNER SETTINGS
All routes require:
1. Authentication
2. Active Child Panel Ownership
----------------------------------------------------
*/

router.use(protect);
router.use(cpOwnerOnly);

/*
----------------------------------------------------
GET ALL SETTINGS
----------------------------------------------------
*/
router.get("/", getCPSettings);

/*
----------------------------------------------------
UPDATE SETTINGS
----------------------------------------------------
*/
router.put("/branding", updateCPBranding);

router.put("/support", updateCPSupportLinks);

router.put("/reseller-fees", updateCPResellerFees);

router.put("/payment-mode", updateCPPaymentMode);

router.put("/service-mode", updateCPServiceMode);

router.put("/domain", updateCPDomain);

router.put("/template", updateCPTemplate);

router.put("/landing-template", updateCPLandingTemplate);

router.post("/auto-deduct", updateCPAutoDeduct);

router.post("/pay-fee", payBillingFee);

export default router;
