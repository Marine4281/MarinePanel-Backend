// routes/cpOwnerOrderRoutes.js
import express from "express";
import {
  getCPOrders,
  getCPOrderStats,
  updateCPOrderStatus,
  updateCPOrderProgress,
  refundCPOrder,
  getCPWalletStats,
} from "../controllers/cpOwnerOrderController.js";

const router = express.Router();

router.get("/", getCPOrders);
router.get("/stats", getCPOrderStats);
router.get("/wallets/stats", getCPWalletStats);
router.post("/:id/status", updateCPOrderStatus);
router.patch("/:id/progress", updateCPOrderProgress);
router.post("/:id/refund", refundCPOrder);

export default router;
