// routes/brandingRoutes.js
import express from "express";
import { getBranding, updateBranding } from "../controllers/brandController.js";
import { detectResellerDomain } from "../middleware/resellerDomainMiddleware.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// Detect reseller first
router.use(detectResellerDomain);

// Fetch branding
router.get("/", protect, getBranding);

// Update branding (reseller logged in)
router.patch("/", protect, updateBranding);

export default router;
