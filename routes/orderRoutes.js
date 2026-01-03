import express from "express";
import { createOrder, getMyOrders, previewOrder } from "../controllers/orderController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/", protect, createOrder);
router.get("/my-orders", protect, getMyOrders);
router.post("/preview", protect, previewOrder); // <-- new endpoint

export default router;