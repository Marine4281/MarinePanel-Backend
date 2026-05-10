// routes/paymentGatewayRoutes.js
import express from "express";
import { protect } from "../middlewares/authMiddleware.js";
import { adminOnly, childPanelOnly } from "../middlewares/adminMiddleware.js";
import {
  getProviders,
  getQuote,
  getUserGateways,
  initializePayment,
  handleWebhook,
  getCpGateways,
  createCpGateway,
  updateCpGateway,
  deleteCpGateway,
  rotateCpWebhookToken,
  adminGetAllGateways,
  adminCreateGateway,
  adminUpdateGateway,
  adminDeleteGateway,
  adminToggleHidden,
  adminRotateWebhookToken,
} from "../controllers/paymentGatewayController.js";

const router = express.Router();

// ─── PUBLIC ──────────────────────────────────────────────────────────
// Webhook — no auth, identified by webhookToken in URL
router.post("/webhooks/:provider/:token", handleWebhook);

// ─── AUTHENTICATED USERS ─────────────────────────────────────────────
router.get("/gateways/providers",    protect, getProviders);       // dynamic form meta
router.get("/gateways/quote",        protect, getQuote);           // fee breakdown
router.get("/gateways",              protect, getUserGateways);    // visible gateways
router.post("/gateways/pay",         protect, initializePayment);  // start payment

// ─── CHILD PANEL OWNER ───────────────────────────────────────────────
router.get("/cp/gateways",                    protect, childPanelOnly, getCpGateways);
router.post("/cp/gateways",                   protect, childPanelOnly, createCpGateway);
router.put("/cp/gateways/:id",                protect, childPanelOnly, updateCpGateway);
router.delete("/cp/gateways/:id",             protect, childPanelOnly, deleteCpGateway);
router.post("/cp/gateways/:id/rotate-token",  protect, childPanelOnly, rotateCpWebhookToken);

// ─── ADMIN ───────────────────────────────────────────────────────────
router.get("/admin/gateways",                      protect, adminOnly, adminGetAllGateways);
router.post("/admin/gateways",                     protect, adminOnly, adminCreateGateway);
router.put("/admin/gateways/:id",                  protect, adminOnly, adminUpdateGateway);
router.delete("/admin/gateways/:id",               protect, adminOnly, adminDeleteGateway);
router.post("/admin/gateways/:id/toggle-hidden",   protect, adminOnly, adminToggleHidden);
router.post("/admin/gateways/:id/rotate-token",    protect, adminOnly, adminRotateWebhookToken);

export default router;
