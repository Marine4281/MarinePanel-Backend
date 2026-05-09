import express from "express";

import {
  getResellerGuides,
  getAllGuidesAdmin,
  createGuide,
  updateGuide,
  deleteGuide,
} from "../controllers/resellerGuideController.js";

import { protect } from "../middlewares/authMiddleware.js";
import { adminOnly } from "../middlewares/adminMiddleware.js";

const router = express.Router();

/*
--------------------------------
Public Routes
--------------------------------
Examples:
GET /api/reseller-guides
GET /api/reseller-guides?placement=activation
GET /api/reseller-guides?placement=dashboard
--------------------------------
*/
router.get("/", getResellerGuides);

/*
--------------------------------
Admin Routes
--------------------------------
*/

/* GET ALL GUIDES INCLUDING HIDDEN */
router.get(
  "/admin/all",
  protect,
  adminOnly,
  getAllGuidesAdmin
);

/* CREATE GUIDE */
router.post(
  "/",
  protect,
  adminOnly,
  createGuide
);

/* UPDATE GUIDE */
router.put(
  "/:id",
  protect,
  adminOnly,
  updateGuide
);

/* DELETE GUIDE */
router.delete(
  "/:id",
  protect,
  adminOnly,
  deleteGuide
);

export default router;
