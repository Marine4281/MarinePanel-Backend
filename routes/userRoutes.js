//routes/userRoutes.js
import express from "express";
import { getProfile, updateProfile ,generateApiKey, revokeApiKey } from "../controllers/userController.js";
import { protect } from "../middlewares/authMiddleware.js"; // JWT auth middleware

const router = express.Router();

// ✅ Use JWT to get user, no :id needed
router.get("/profile", protect, getProfile);
router.put("/profile", protect, updateProfile);

router.post("/generate-api-key", protect, generateApiKey);
router.post("/revoke-api-key", protect, revokeApiKey);

export default router;
