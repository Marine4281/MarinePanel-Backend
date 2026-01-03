import express from "express";
import { getServicesPublic } from "../controllers/serviceController.js";

const router = express.Router();

// Public route
router.get("/", getServicesPublic);

export default router;