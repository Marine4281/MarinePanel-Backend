import express from "express";
import { initializePaystack, handlePaystackWebhook } from "../controllers/paymentController.js";
import protect from "../middleware/authMiddleware.js";

const router = express.Router();

// Initialize payment (protected)
router.post("/initialize", protect, initializePaystack);

// Webhook (no auth middleware!)
router.post("/webhook/paystack", handlePaystackWebhook);

export default router;
