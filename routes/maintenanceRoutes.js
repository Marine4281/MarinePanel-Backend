// routes/maintenanceRoutes.js
import express from "express";
import { getMaintenanceStatus } from "../controllers/maintenanceController.js";

const router = express.Router();

// Public — no auth required; frontend polls this on load
router.get("/status", getMaintenanceStatus);

export default router;
