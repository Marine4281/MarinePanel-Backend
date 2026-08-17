import express from "express";
import {
  getApiOverview,
  updateApiSettings,
  getApiUsers,
  regenerateApiKey,
  revokeApiKey,
  toggleApiAccess,
  getApiUsage,
  getApiLogs,
  getApiLeaderboard,
} from "../controllers/adminApiController.js";
import { protect } from "../middlewares/authMiddleware.js";
import { adminOnly } from "../middlewares/adminMiddleware.js";

const router = express.Router();
router.use(protect, adminOnly);

router.get("/overview", getApiOverview);
router.put("/settings", updateApiSettings);

router.get("/users", getApiUsers);
router.post("/users/:id/regenerate", regenerateApiKey);
router.post("/users/:id/revoke", revokeApiKey);
router.put("/users/:id/toggle", toggleApiAccess);

router.get("/usage", getApiUsage);
router.get("/logs", getApiLogs);
router.get("/leaderboard", getApiLeaderboard);

export default router;
