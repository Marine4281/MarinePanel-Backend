// routes/cpOwnerOrderRoutes.js

import express from "express";
import {
  getCPOrders,
  completeCPOrder,
  refundCPOrder,
  getCPWalletStats,
} from "../controllers/cpOwnerOrderController.js";

const router = express.Router();

// Auth + childPanelOnly applied in app.js for this route group

router.get("/", getCPOrders);
router.post("/:id/complete", completeCPOrder);
router.post("/:id/refund", refundCPOrder);
router.get("/wallets/stats", getCPWalletStats);

export default router;
