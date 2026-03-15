import express from "express";
import { getBranding } from "../controllers/brandingController.js";
import { updateBranding } from "../controllers/resellerController.js"; // make sure this import is correct
import { protect } from "../middlewares/authMiddleware.js"; // optional auth

const router = express.Router();

// GET branding
router.get("/", getBranding);

// POST branding update
router.post("/", protect, updateBranding); // <-- this allows POST /api/reseller/branding

export default router;
