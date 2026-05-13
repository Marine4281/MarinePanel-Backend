// routes/ChildPanelUserRoutes.js

import express from "express";
import {
  getCPUsers,
  getCPUserById,
  blockCPUser,
  unblockCPUser,
  freezeCPUser,
  unfreezeCPUser,
  deleteCPUser,
  updateCPUserBalance,
  updateCPUserCommission,
  getCPUserOrders,
  getCPUserTransactions,
} from "../controllers/ChildUserController.js";

const router = express.Router();

// Auth + cpOwnerOnly applied in app.js

router.get("/", getCPUsers);

// Specific sub-routes BEFORE /:id
router.get("/:id/orders", getCPUserOrders);
router.get("/:id/transactions", getCPUserTransactions);

router.get("/:id", getCPUserById);

router.patch("/:id/block", blockCPUser);
router.patch("/:id/unblock", unblockCPUser);
router.patch("/:id/freeze", freezeCPUser);
router.patch("/:id/unfreeze", unfreezeCPUser);

router.put("/:id/balance", updateCPUserBalance);
router.patch("/:id/commission", updateCPUserCommission);

router.delete("/:id", deleteCPUser);

export default router;
