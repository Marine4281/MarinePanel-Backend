import express from "express";
import { getPublicCommission } from "../controllers/commission.js";

const router = express.Router();

// GET /api/settings/commission
router.get("/commission", getPublicCommission);

export default router;
