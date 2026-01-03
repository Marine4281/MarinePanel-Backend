import express from "express";
import { 
  register, 
  login, 
  forgotPassword, 
  resetPassword, 
  getProfile 
} from "../controllers/authController.js";
import { protect } from "../middlewares/authMiddleware.js"; // JWT auth middleware

const router = express.Router();

// Public routes
router.post("/register", register);
router.post("/login", login);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password/:token", resetPassword);

// Protected route (user must be logged in)
router.get("/profile", protect, getProfile);

export default router;