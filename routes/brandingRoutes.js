import express from "express";
import { getBranding } from "../controllers/brandingController.js";

const router = express.Router();

router.get("/", getBranding);

export default router;
