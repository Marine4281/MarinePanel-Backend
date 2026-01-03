// routes/smmWebhookRoutes.js
import express from "express";
import { smmWebhook } from "../controllers/smmWebhookController.js";

const router = express.Router();

// Provider calls this webhook
router.post("/webhook", smmWebhook);

export default router;