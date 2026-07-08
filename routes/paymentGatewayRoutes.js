// routes/paymentGatewayRoutes.js
import express from "express";
import { protect } from "../middlewares/authMiddleware.js";
import { adminOnly, childPanelOnly } from "../middlewares/adminMiddleware.js";
import {
  getProviders, getQuote, getUserGateways, initializePayment, handleWebhook,
  adminGetProviders, adminCreateProvider, adminUpdateProvider, adminDeleteProvider,
  adminGetAllGateways, adminCreateGateway, adminUpdateGateway, adminDeleteGateway,
  adminToggleHidden, adminRotateWebhookToken,
  adminGetPendingDeposits, adminApproveDeposit, adminRejectDeposit,
  cpGetPendingDeposits, cpApproveDeposit, cpRejectDeposit,
  getCpGateways, createCpGateway, updateCpGateway, deleteCpGateway, rotateCpWebhookToken,
  getCpAvailableProviders,
  connectPlatformGateway, getUserWithdrawGateways, getWithdrawQuote, initializeWithdrawal, handlePayoutWebhook,
  adminGetPendingWithdrawals, adminApproveWithdrawal, adminRejectWithdrawal,
  cpGetPendingWithdrawals, cpApproveWithdrawal, cpRejectWithdrawal,
} from "../controllers/paymentGatewayController.js";

const router = express.Router();

// ─── PUBLIC (webhook) ─────────────────────────────────────────────────
router.post("/webhooks/:provider/:token", handleWebhook);



router.get("/cp/available-providers",           protect, childPanelOnly, getCpAvailableProviders);
router.post("/cp/gateways/connect-platform",    protect, childPanelOnly, connectPlatformGateway);
// ─── USER ─────────────────────────────────────────────────────────────
router.get("/gateways/providers",  protect, getProviders);
router.get("/gateways/quote",      protect, getQuote);
router.get("/gateways",            protect, getUserGateways);
router.post("/gateways/pay",       protect, initializePayment);

// ─── CP OWNER ─────────────────────────────────────────────────────────
router.get("/cp/gateways",                   protect, childPanelOnly, getCpGateways);
router.post("/cp/gateways",                  protect, childPanelOnly, createCpGateway);
router.put("/cp/gateways/:id",               protect, childPanelOnly, updateCpGateway);
router.delete("/cp/gateways/:id",            protect, childPanelOnly, deleteCpGateway);
router.post("/cp/gateways/:id/rotate-token", protect, childPanelOnly, rotateCpWebhookToken);
router.get("/cp/deposits/pending",      protect, childPanelOnly, cpGetPendingDeposits);
router.post("/cp/deposits/:id/approve", protect, childPanelOnly, cpApproveDeposit);
router.post("/cp/deposits/:id/reject",  protect, childPanelOnly, cpRejectDeposit);

// ─── ADMIN: PROVIDERS ─────────────────────────────────────────────────
router.get("/admin/payment-providers",        protect, adminOnly, adminGetProviders);
router.post("/admin/payment-providers",       protect, adminOnly, adminCreateProvider);
router.put("/admin/payment-providers/:id",    protect, adminOnly, adminUpdateProvider);
router.delete("/admin/payment-providers/:id", protect, adminOnly, adminDeleteProvider);

// ─── ADMIN: GATEWAYS ──────────────────────────────────────────────────
router.get("/admin/gateways",                      protect, adminOnly, adminGetAllGateways);
router.post("/admin/gateways",                     protect, adminOnly, adminCreateGateway);
router.put("/admin/gateways/:id",                  protect, adminOnly, adminUpdateGateway);
router.delete("/admin/gateways/:id",               protect, adminOnly, adminDeleteGateway);
router.post("/admin/gateways/:id/toggle-hidden",   protect, adminOnly, adminToggleHidden);
router.post("/admin/gateways/:id/rotate-token",    protect, adminOnly, adminRotateWebhookToken);

// ─── ADMIN: PENDING DEPOSITS ──────────────────────────────────────────
router.get("/admin/deposits/pending",         protect, adminOnly, adminGetPendingDeposits);
router.post("/admin/deposits/:id/approve",    protect, adminOnly, adminApproveDeposit);
router.post("/admin/deposits/:id/reject",     protect, adminOnly, adminRejectDeposit);

//Withdrawals 
router.get("/withdraw-gateways",       protect, getUserWithdrawGateways);
router.get("/withdraw-gateways/quote", protect, getWithdrawQuote);
router.post("/withdraw-gateways/pay",  protect, initializeWithdrawal);
router.post("/webhooks/payout/:provider/:token", handlePayoutWebhook);

router.get("/admin/withdrawals/pending",      protect, adminOnly, adminGetPendingWithdrawals);
router.post("/admin/withdrawals/:id/approve", protect, adminOnly, adminApproveWithdrawal);
router.post("/admin/withdrawals/:id/reject",  protect, adminOnly, adminRejectWithdrawal);

// ─── CP OWNER: PENDING GATEWAY WITHDRAWALS (their own end users) ──────
router.get("/cp/withdrawals/pending",      protect, childPanelOnly, cpGetPendingWithdrawals);
router.post("/cp/withdrawals/:id/approve", protect, childPanelOnly, cpApproveWithdrawal);
router.post("/cp/withdrawals/:id/reject",  protect, childPanelOnly, cpRejectWithdrawal);

export default router;
