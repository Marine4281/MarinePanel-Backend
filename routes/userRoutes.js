import express from "express";
import { getProfile, updateProfile, promoteToAdmin } from "../controllers/userController.js";
import { protect } from "../middlewares/authMiddleware.js";
import { adminOnly } from "../middlewares/adminMiddleware.js";

const router = express.Router();

// ✅ Self-profile routes
router.get("/profile", protect, getProfile);
router.put("/profile", protect, updateProfile);

// ✅ Admin-only route to promote a user
router.patch("/:id/promote", protect, adminOnly, promoteToAdmin);
// Demote admin to user
router.patch("/:id/demote", protect, adminOnly, demoteFromAdmin);

export default router;
