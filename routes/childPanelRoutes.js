// routes/childPanelRoutes.js

import express from "express";
import {
  getChildPanelActivationFee,
  activateChildPanel,
  getChildPanelDashboard,
  getChildPanelResellers,
  getChildPanelOrders,
  updateChildPanelResellerCommission,
  toggleChildPanelResellerStatus,
  updateChildPanelBranding,
  updateChildPanelDomain,
  updateChildPanelSettings,
  getChildPanelBranding,
} from "../controllers/childPanelController.js";

import {
  getCPUsers,
  getCPUserById,
  cpBlockUser,
  cpUnblockUser,
  cpFreezeUser,
  cpUnfreezeUser,
  cpDeleteUser,
  cpUpdateUserBalance,
  cpUpdateUserCommission,
  cpGetUserTransactions,
  cpGetUserOrders,
} from "../controllers/childPanelUserController.js";

import { protect } from "../middlewares/authMiddleware.js";
import { childPanelOnly } from "../middlewares/adminMiddleware.js";

const router = express.Router();

// ── Public ─────────────────────────────────────────────────────
router.get("/activation-fee", getChildPanelActivationFee);
router.get("/branding", getChildPanelBranding);

// ── Activate ───────────────────────────────────────────────────
router.post("/activate", protect, activateChildPanel);

// ── Dashboard ──────────────────────────────────────────────────
router.get("/dashboard", protect, childPanelOnly, getChildPanelDashboard);

// ── Resellers ──────────────────────────────────────────────────
router.get("/resellers", protect, childPanelOnly, getChildPanelResellers);
router.put("/resellers/:id/toggle-status", protect, childPanelOnly, toggleChildPanelResellerStatus);
router.put("/resellers/:id/commission", protect, childPanelOnly, updateChildPanelResellerCommission);

// ── Users ──────────────────────────────────────────────────────
// IMPORTANT: specific sub-routes before /:id to avoid conflicts
router.get("/users", protect, childPanelOnly, getCPUsers);
router.get("/users/:id/orders", protect, childPanelOnly, cpGetUserOrders);
router.get("/users/:id/transactions", protect, childPanelOnly, cpGetUserTransactions);
router.get("/users/:id", protect, childPanelOnly, getCPUserById);
router.patch("/users/:id/block", protect, childPanelOnly, cpBlockUser);
router.patch("/users/:id/unblock", protect, childPanelOnly, cpUnblockUser);
router.patch("/users/:id/freeze", protect, childPanelOnly, cpFreezeUser);
router.patch("/users/:id/unfreeze", protect, childPanelOnly, cpUnfreezeUser);
router.put("/users/:id/balance", protect, childPanelOnly, cpUpdateUserBalance);
router.patch("/users/:id/commission", protect, childPanelOnly, cpUpdateUserCommission);
router.delete("/users/:id", protect, childPanelOnly, cpDeleteUser);

// ── Orders ─────────────────────────────────────────────────────
router.get("/orders", protect, childPanelOnly, getChildPanelOrders);

// ── Branding ───────────────────────────────────────────────────
router.put("/branding", protect, childPanelOnly, updateChildPanelBranding);

// ── Domain ─────────────────────────────────────────────────────
router.put("/domain", protect, childPanelOnly, updateChildPanelDomain);

// ── Settings ───────────────────────────────────────────────────
router.put("/settings", protect, childPanelOnly, updateChildPanelSettings);

export default router;
