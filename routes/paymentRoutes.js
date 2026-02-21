import express from "express";
import { handlePaystackWebhook } from "../controllers/WebhookController.js";
import { addFunds, getWallet } from "../controllers/walletController.js";
import { getUserPaymentMethods } from "../controllers/paymentMethodController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

// your routes here
// router.post("/webhook/paystack", handlePaystackWebhook);
// router.post("/addfunds", protect, addFunds);
// router.get("/wallet", protect, getWallet);
// etc...

export default router;
