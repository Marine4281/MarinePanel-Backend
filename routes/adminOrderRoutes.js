import express from "express";
import { getAllOrders, completeOrder, refundOrder } from "../controllers/adminOrderController.js";
import { getWalletStats } from "../controllers/walletController.js";
import { adminOnly } from "../middlewares/adminMiddleware.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

// Only admin users can access these routes
router.use(protect, adminOnly);

// Orders routes
router.get("/", getAllOrders);
router.post("/:id/complete", completeOrder);
router.post("/:id/refund", refundOrder);

// ✅ Wallet stats route for admin dashboard
router.get("/wallets/stats", getWalletStats);

export default router;