import express from "express";
import { getCpAdminLogs } from "../controllers/cpAdminLogController.js";

const router = express.Router();

// Auth + cpOwnerOnly applied in app.js
router.get("/", getCpAdminLogs);

export default router;
