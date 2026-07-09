// routes/currencyRoutes.js
import express from "express";
import { protect } from "../middlewares/authMiddleware.js";
import { adminOnly, childPanelOnly } from "../middlewares/adminMiddleware.js";
import {
  adminGetCurrencies, adminCreateCurrency, adminUpdateCurrency, adminDeleteCurrency,
  getCpCurrencies, createCpCurrency, updateCpCurrency, deleteCpCurrency,
  getUserCurrencies, selectUserCurrency,
} from "../controllers/currencyController.js";

const router = express.Router();

// ─── USER (any logged-in user, scoped to their panel) ─────────────────
router.get("/",        protect, getUserCurrencies);
router.put("/select",  protect, selectUserCurrency);

// ─── ADMIN: MAIN PLATFORM ───────────────────────────────────────────
router.get("/admin",           protect, adminOnly, adminGetCurrencies);
router.post("/admin",          protect, adminOnly, adminCreateCurrency);
router.put("/admin/:id",       protect, adminOnly, adminUpdateCurrency);
router.delete("/admin/:id",    protect, adminOnly, adminDeleteCurrency);

// ─── CP OWNER: OWN PANEL ─────────────────────────────────────────────
router.get("/cp",              protect, childPanelOnly, getCpCurrencies);
router.post("/cp",             protect, childPanelOnly, createCpCurrency);
router.put("/cp/:id",          protect, childPanelOnly, updateCpCurrency);
router.delete("/cp/:id",       protect, childPanelOnly, deleteCpCurrency);

export default router;
