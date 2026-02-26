import express from "express";
import {
  getUserOrders,
  updateOrderStatus,
  updateOrderProgress,   // 👈 ADD THIS
  refundOrder,
} from "../controllers/AdminUserOrdersController.js";

const router = express.Router();

router.get("/", getUserOrders);

router.post("/:id/status", updateOrderStatus);

// 👇 ADD THIS ROUTE
router.patch("/:id/progress", updateOrderProgress);

router.post("/:id/refund", refundOrder);

export default router;
