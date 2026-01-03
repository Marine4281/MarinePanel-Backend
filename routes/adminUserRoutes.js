import express from "express";
import {
  getAllUsers,
  blockUser,
  unblockUser,
  deleteUser,
  updateUserBalance,
  getUserOrders,
  getUserTransactions,
} from "../controllers/adminUserController.js";

import { protect } from "../middlewares/authMiddleware.js";
import { adminOnly } from "../middlewares/adminMiddleware.js";

const router = express.Router();

// Apply middleware to all admin user routes
router.use(protect, adminOnly);

// Routes
router.get("/", getAllUsers);                  // GET /api/admin/users
router.put("/:id/block", blockUser);           // PUT /api/admin/users/:id/block
router.put("/:id/unblock", unblockUser);       // PUT /api/admin/users/:id/unblock
router.put("/:id/balance", updateUserBalance); // PUT /api/admin/users/:id/balance
router.delete("/:id", deleteUser);             // DELETE /api/admin/users/:id
router.get("/:id/orders", getUserOrders);      // GET /api/admin/users/:id/orders
router.get("/:id/transactions", getUserTransactions); // GET /api/admin/users/:id/transactions

export default router;