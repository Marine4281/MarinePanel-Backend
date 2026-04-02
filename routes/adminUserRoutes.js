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
} from "../controllers/adminUserController.js";

import { protect } from "../middlewares/authMiddleware.js";
import { adminOnly } from "../middlewares/adminMiddleware.js";

const router = express.Router();

// Apply middleware to all admin user routes
router.use(protect, adminOnly);

// ✅ GET all users
router.get("/", getAllUsers); // GET /api/admin/users

// ✅ BLOCK / UNBLOCK user
router.patch("/:id/block", blockUser);   // PATCH /api/admin/users/:id/block
router.patch("/:id/unblock", unblockUser); // PATCH /api/admin/users/:id/unblock

// ✅ UPDATE balance
router.put("/:id/balance", updateUserBalance); // PUT /api/admin/users/:id/balance

// ✅ DELETE user and related data
router.delete("/:id", deleteUser); // DELETE /api/admin/users/:id

// ✅ GET user orders
router.get("/:id/orders", getUserOrders); // GET /api/admin/users/:id/orders

// ✅ GET single user
router.get("/:id", getUserById);

// ✅ GET user transactions
router.get("/:id/transactions", getUserTransactions); // GET /api/admin/users/:id/transactions

// ✅ PROMOTE / DEMOTE admin
router.patch("/:id/promote", promoteToAdmin); // PATCH /api/admin/users/:id/promote
router.patch("/:id/demote", demoteFromAdmin); // PATCH /api/admin/users/:id/demote

export default router;
