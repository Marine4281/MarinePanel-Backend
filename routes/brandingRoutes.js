// routes/brandingRoutes.js
import express from "express";
import { getBranding } from "../controllers/brandingController.js";
import { updateBranding } from "../controllers/resellerController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

/*
--------------------------------
Get Branding
- For reseller dashboard: requires login to detect reseller
- For end users: can still work with reseller domain/subdomain if resellerDomainMiddleware is applied globally
--------------------------------
*/
router.get("/", protect, getBranding);

/*
--------------------------------
Update Branding (Reseller Only)
--------------------------------
*/
router.patch("/", protect, updateBranding);

export default router;
