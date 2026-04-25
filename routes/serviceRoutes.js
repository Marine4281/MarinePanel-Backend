//routes/serviceRoutes.js
import express from "express";
import { getServicesPublic } from "../controllers/serviceController.js";
import { getServiceSettings } from "../controllers/serviceTogglesController.js";

const router = express.Router();

// Public route
router.get("/", getServicesPublic);
router.get("/service-settings", getServiceSettings);

export default router;
