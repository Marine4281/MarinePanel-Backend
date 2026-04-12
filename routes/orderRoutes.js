import express from "express";
import { createOrder, getMyOrders, getMyOrdersStats, previewOrder } from "../controllers/orderController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/", protect, createOrder);
router.get("/my-orders", protect, getMyOrders);
router.get("/my-orders/stats", protect, getMyOrdersStats);
router.post("/preview", protect, previewOrder); // <-- new endpoint

export default router;
