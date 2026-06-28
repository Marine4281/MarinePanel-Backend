// routes/cpOwnerResellerRoutes.js

import express from "express";
import {
  getCPResellers,
  getCPResellerDetails,
  toggleCPResellerStatus,
  updateCPResellerCommission,
  updateCPResellerBalance,
  getCPResellerUsers,
  getCPResellerOrders,
  updateCPResellerUserBalance,
  getResellerActivationUnreadCount,
  getResellerActivationEvents,
  markResellerActivationEventsSeen,
  getCPPlatformFee,
} from "../controllers/cpOwnerResellerController.js";

const router = express.Router();

// Static / fixed-segment routes MUST come before "/:id",
// otherwise Express matches them to the :id param instead.
router.get("/activation-feed/unread-count", getResellerActivationUnreadCount);
router.get("/activation-feed", getResellerActivationEvents);
router.patch("/activation-feed/mark-seen", markResellerActivationEventsSeen);
router.get("/platform-fee", getCPPlatformFee);

router.get("/", getCPResellers);
router.get("/:id", getCPResellerDetails);

router.put("/:id/commission", updateCPResellerCommission);
router.put("/:id/toggle-status", toggleCPResellerStatus);
router.put("/:id/balance", updateCPResellerBalance);

router.get("/:id/users", getCPResellerUsers);
router.get("/:id/orders", getCPResellerOrders);

// CP owner editing a reseller's end-user balance
router.put("/:id/users/:userId/balance", updateCPResellerUserBalance);

export default router;
