import express from "express";
import { initializePaystack, handlePaystackWebhook } from "../controllers/paymentController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

// Protected route (user must be logged in)
router.post("/initialize", protect, initializePaystack);

// Webhook (NO auth middleware here)
router.post("/webhook/paystack", handlePaystackWebhook);

export default router;
