// routes/cpOwnerOrderRoutes.js

import express from "express";
import {
  getCPOrders,
  completeCPOrder,
  refundCPOrder,
  getCPWalletStats,
  partialCPOrder,
  manualEditCPOrder,
} from "../controllers/cpOwnerOrderController.js";

const router = express.Router();

router.get("/", getCPOrders);
router.post("/:id/complete", completeCPOrder);
router.post("/:id/refund", refundCPOrder);
router.post("/:id/partial", partialCPOrder);
router.patch("/:id/edit", manualEditCPOrder);
router.get("/wallets/stats", getCPWalletStats);

export default router;
