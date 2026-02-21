import express from "express";
import { handlePaystackWebhook } from "../controllers/WebhookController.js";
import { addFunds, getWallet } from "../controllers/WalletController.js";
import { getUserPaymentMethods } from "../controllers/PaymentMethodsController.js";
import { protect } from "../middlewares/authMiddleware.js"; // If you have auth

const router = express.Router();
