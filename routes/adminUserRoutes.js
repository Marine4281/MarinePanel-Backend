// routes/adminUserRoutes.js
import express from "express";
import {
  getAllUsers,
  getUserById,
  blockUser,
  unblockUser,
  deleteUser,
  updateUserBalance,
  getUserOrders,
  getUserTransactions,
  promoteToAdmin,
  demoteFromAdmin,
  freezeUser,        // 🆕
  unfreezeUser,      // 🆕
} from "../controllers/adminUserController.js";

import { protect } from "../middlewares/authMiddleware.js";
import { adminOnly } from "../middlewares/adminMiddleware.js";

const router = express.Router();

// Apply middleware to all admin user routes
router.use(protect, adminOnly);

// ✅ GET all users
router.get("/", getAllUsers);

// ✅ IMPORTANT: Specific routes FIRST
router.get("/:id/orders", getUserOrders);
router.get("/:id/transactions", getUserTransactions);

// ✅ GET single user (AFTER specific routes)
router.get("/:id", getUserById);

// ✅ BLOCK / UNBLOCK
router.patch("/:id/block", blockUser);
router.patch("/:id/unblock", unblockUser);

// 🆕 FREEZE / UNFREEZE
router.patch("/:id/freeze", freezeUser);
router.patch("/:id/unfreeze", unfreezeUser);

// ✅ UPDATE balance
router.put("/:id/balance", updateUserBalance);

// ✅ PROMOTE / DEMOTE
router.patch("/:id/promote", promoteToAdmin);
router.patch("/:id/demote", demoteFromAdmin);

// ✅ DELETE
router.delete("/:id", deleteUser);

export default router;
