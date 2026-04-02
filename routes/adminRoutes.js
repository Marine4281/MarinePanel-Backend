import express from "express";
import {
  getUsers,
  getUserById,
  updateUserBalance,
  promoteToAdmin,
  demoteFromAdmin,
  getUserTransactions
} from "../controllers/userController.js";
import { protect } from "../middlewares/authMiddleware.js";
import { adminOnly } from "../middlewares/adminMiddleware.js";

const router = express.Router();

// Protect all routes to admin
router.use(protect, adminOnly);

// Get all users
router.get("/users", getUsers);

// Get single user (with transactions)
router.get("/users/:id", getUserById);

// Update user balance
router.put("/users/:id/balance", updateUserBalance);

// Promote / demote user
router.patch("/users/:id/promote", promoteToAdmin);
router.patch("/users/:id/demote", demoteFromAdmin);

// Get user transactions
router.get("/users/:id/transactions", getUserTransactions);

export default router;
