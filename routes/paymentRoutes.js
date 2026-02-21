import express from "express";
import { handlePaystackWebhook } from "../controllers/WebhookController.js";
import { addFunds, getWallet } from "../controllers/walletController.js";
import { getUserPaymentMethods } from "../controllers/paymentMethodController.js";
import { protect } from "../middlewares/authMiddleware.js"; // If you have auth

const router = express.Router();
