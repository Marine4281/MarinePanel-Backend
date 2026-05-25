import express from "express";
import { getCpAdminLogs } from "../controllers/cpAdminLogController.js";
import { protect } from "../middlewares/authMiddleware.js";
import { childPanelOnly } from "../middlewares/childPanelMiddleware.js"; // your existing CP guard

const router = express.Router();

router.get("/", protect, childPanelOnly, getCpAdminLogs);

export default router;
