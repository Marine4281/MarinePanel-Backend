import express from "express";
import {
  getResellerGuides,
  createGuide,
  updateGuide,
  deleteGuide,
} from "../controllers/resellerGuideController.js";

import { protect } from "../middlewares/authMiddleware.js";
import { adminOnly } from "../middlewares/adminMiddleware.js";

const router = express.Router();

/* Public */
router.get("/", getResellerGuides);

/* Admin */
router.post("/", protect, adminOnly, createGuide);
router.put("/:id", protect, adminOnly, updateGuide);
router.delete("/:id", protect, adminOnly, deleteGuide);

export default router;
