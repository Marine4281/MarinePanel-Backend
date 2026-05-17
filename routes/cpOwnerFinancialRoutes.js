import express from "express";
import {
  getCPFinancialSummary,
  getCPProfit,
  getCPFinancialUsers,
  getCPWithdrawals,
  getCPResellerEarnings,
  cpApproveWithdrawal,
  cpRejectWithdrawal,
  cpSetWithdrawalStatus,
} from "../controllers/cpOwnerFinancialController.js";

const router = express.Router();

router.get("/summary",           getCPFinancialSummary);
router.get("/profit",            getCPProfit);
router.get("/users",             getCPFinancialUsers);
router.get("/withdrawals",       getCPWithdrawals);
router.get("/reseller-earnings", getCPResellerEarnings);

// Reseller withdrawal actions
router.post("/withdrawals/:userId/:txId/approve", cpApproveWithdrawal);
router.post("/withdrawals/:userId/:txId/reject",  cpRejectWithdrawal);
router.patch("/withdrawals/:userId/:txId/status", cpSetWithdrawalStatus);

export default router;
