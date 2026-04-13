import express from "express";
import {
  createOrder,
  getMyOrders,
  getMyOrdersStats,
  previewOrder,
  cancelOrder,          // ✅ ADD
} from "../controllers/orderController.js";

import {
  requestRefill,        // ✅ ADD (from new refill controller)
} from "../controllers/refillOrder.js";

import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

// ===============================================
// ORDER CORE
// ===============================================
router.post("/", protect, createOrder);
router.get("/my-orders", protect, getMyOrders);
router.get("/my-orders/stats", protect, getMyOrdersStats);
router.post("/preview", protect, previewOrder);

// ===============================================
// ❌ CANCEL ORDER
// ===============================================
router.post("/:orderId/cancel", protect, cancelOrder);

// ===============================================
// 🔁 REFILL ORDER
// ===============================================
router.post("/:orderId/refill", protect, requestRefill);

export default router;
