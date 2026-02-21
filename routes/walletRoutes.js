import express from "express";
import { getWallet, addFundsManual, withdrawFunds } from "../controllers/walletController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/", protect, getWallet);
router.post("/add-funds", addFundsManual);
router.post("/withdraw", protect, withdrawFunds);

export default router;
