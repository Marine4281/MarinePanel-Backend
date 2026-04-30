// routes/cpOwnerUserRoutes.js

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
  getCPUserOrders,
  getCPUserTransactions,
} from "../controllers/cpOwnerUserController.js";

const router = express.Router();

// Auth + childPanelOnly are applied in app.js for this route group

router.get("/", getCPUsers);

// Specific routes before /:id
router.get("/:id/orders", getCPUserOrders);
router.get("/:id/transactions", getCPUserTransactions);

router.get("/:id", getCPUserById);

router.patch("/:id/block", blockCPUser);
router.patch("/:id/unblock", unblockCPUser);
router.patch("/:id/freeze", freezeCPUser);
router.patch("/:id/unfreeze", unfreezeCPUser);

router.put("/:id/balance", updateCPUserBalance);

router.delete("/:id", deleteCPUser);

export default router;
