// routes/brandingRoutes.js

import express from "express";
import { getBranding } from "../controllers/brandingController.js";
import { updateBranding } from "../controllers/resellerController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

/*
--------------------------------
Get Branding (Public)
Used by frontend to detect
brand name, logo, theme color
--------------------------------
*/
router.get("/", getBranding);

/*
--------------------------------
Update Branding (Reseller Only)
--------------------------------
*/
router.patch("/", protect, updateBranding);

export default router;
