import express from "express";
import { getCpAdminLogs } from "../controllers/cpAdminLogController.js";

const router = express.Router();
router.get("/", getCpAdminLogs);
export default router;
