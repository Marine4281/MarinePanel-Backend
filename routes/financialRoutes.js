// routes/financialRoutes.js
import express from "express";
import {
  getFinancialSummary,
  getProfit,
  getFinancialUsers,
  getAllWithdrawals,
  setWithdrawalStatus,
  getResellerEarnings,
} from "../controllers/financialController.js";

const router = express.Router();
// Auth + adminOnly applied in app.js

router.get("/summary",            getFinancialSummary);
router.get("/profit",             getProfit);
router.get("/users",              getFinancialUsers);
router.get("/withdrawals",        getAllWithdrawals);
router.patch("/withdrawals/:userId/:txId/status", setWithdrawalStatus);
router.get("/reseller-earnings",  getResellerEarnings);

export default router;
