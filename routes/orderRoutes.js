import express from "express";
import {
  createOrder,
  getMyOrders,
  getMyOrdersStats,
  previewOrder,
} from "../controllers/orderController.js";
import {
  refillOrder, cancelOrder,
} from "../controllers/orderActionController.js";
import { protect } from "../middlewares/authMiddleware.js";
import { checkNoOrdersMaintenance } from "../middlewares/maintenanceMiddleware.js";

const router = express.Router();

// ORDER CORE
router.post("/", protect, checkNoOrdersMaintenance, createOrder);
router.get("/my-orders", protect, getMyOrders);
router.get("/my-orders/stats", protect, getMyOrdersStats);
router.post("/preview", protect, previewOrder);

// CANCEL ORDER
router.post("/:orderId/cancel", protect, cancelOrder);

// REFILL ORDER
router.post("/:orderId/refill", protect, refillOrder);

export default router;
