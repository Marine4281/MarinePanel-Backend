// routes/cpOwnerWithdrawalRoutes.js

import express from "express";
import {
  requestWithdrawal,
  getWithdrawalHistory,
} from "../controllers/cpOwnerWithdrawalController.js";

const router = express.Router();

// Auth + childPanelOnly applied in app.js

router.post("/withdraw", requestWithdrawal);
router.get("/withdrawals", getWithdrawalHistory);

export default router;
