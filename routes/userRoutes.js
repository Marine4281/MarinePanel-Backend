import express from "express";
import { getProfile, updateProfile, promoteToAdmin, demoteFromAdmin, getUserById} from "../controllers/userController.js";
import { protect } from "../middlewares/authMiddleware.js";
import { adminOnly } from "../middlewares/adminMiddleware.js";

const router = express.Router();

// ✅ Self-profile routes
router.get("/profile", protect, getProfile);
router.put("/profile", protect, updateProfile);

// ✅ Admin-only routes
router.patch("/:id/promote", protect, adminOnly, promoteToAdmin);
router.patch("/:id/demote", protect, adminOnly, demoteFromAdmin);
// Get single user (admin only)
router.get("/:id", protect, adminOnly, getUserById);

export default router;
