// routes/childPanelGuideRoutes.js
import express from "express";
import {
  getChildPanelGuides,
  getAllChildPanelGuidesAdmin,
  createChildPanelGuide,
  updateChildPanelGuide,
  deleteChildPanelGuide,
} from "../controllers/childPanelGuideController.js";
import { protect } from "../middlewares/authMiddleware.js";
import { adminOnly } from "../middlewares/adminMiddleware.js";

const router = express.Router();

// Public — visible guides for activation / dashboard pages
router.get("/", getChildPanelGuides);

export default router;

// ─── Admin sub-router ─────────────────────────────────────
export const adminGuideRouter = express.Router();

adminGuideRouter.get("/",         protect, adminOnly, getAllChildPanelGuidesAdmin);
adminGuideRouter.post("/",        protect, adminOnly, createChildPanelGuide);
adminGuideRouter.put("/:id",      protect, adminOnly, updateChildPanelGuide);
adminGuideRouter.delete("/:id",   protect, adminOnly, deleteChildPanelGuide);
