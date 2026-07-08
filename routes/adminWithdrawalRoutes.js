import express from "express";
import {
  
  approveWithdrawal,
  rejectWithdrawal,
} from "../controllers/adminWithdrawalController.js";

const router = express.Router();

// protect + adminOnly applied in app.js


router.post("/:userId/:txId/approve", approveWithdrawal);
router.post("/:userId/:txId/reject", rejectWithdrawal);

export default router;
