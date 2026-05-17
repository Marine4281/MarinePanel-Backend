// routes/cpOwnerFinancialRoutes.js
import express from "express";
import {
  getCPFinancialSummary,
  getCPProfit,
  getCPFinancialUsers,
  getCPWithdrawals,
  getCPResellerEarnings,
} from "../controllers/cpOwnerFinancialController.js";

const router = express.Router();
// Auth + cpOwnerOnly applied in app.js

router.get("/summary",           getCPFinancialSummary);
router.get("/profit",            getCPProfit);
router.get("/users",             getCPFinancialUsers);
router.get("/withdrawals",       getCPWithdrawals);
router.get("/reseller-earnings", getCPResellerEarnings);

export default router;
