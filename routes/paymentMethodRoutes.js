import express from "express";
import { getUserPaymentMethods } from "../controllers/paymentMethodController.js";

const router = express.Router();

// GET /api/payment-methods
router.get("/", getUserPaymentMethods);

export default router;