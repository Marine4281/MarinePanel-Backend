import express from "express";
import { handlePaystackWebhook } from "../controllers/WebHookController.js";

const router = express.Router();

// Paystack webhook
router.post("/paystack/webhook", handlePaystackWebhook);

export default router;
