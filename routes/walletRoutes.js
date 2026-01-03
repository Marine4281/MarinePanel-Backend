import express from "express";
import { getWallet, addFunds, withdrawFunds } from "../controllers/WalletController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/", protect, getWallet);
router.post("/deposit", protect, addFunds);
router.post("/withdraw", protect, withdrawFunds);

export default router;