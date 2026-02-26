import express from "express";
import {
  getUserOrders,
  updateOrderStatus,
  refundOrder,
} from "../controllers/adminUserOrdersController.js";

const router = express.Router();

router.get("/", getUserOrders);
router.post("/:id/status", updateOrderStatus);
router.post("/:id/refund", refundOrder);

export default router;
