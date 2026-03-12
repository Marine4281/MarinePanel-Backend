import express from "express";
import {
  getResellerServices,
  updateServiceVisibility,
  updateServiceName,
  setResellerCommission,
} from "../controllers/resellerServiceController.js";

import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

/*
--------------------------------
Get all services with final price
--------------------------------
*/
router.get("/", protect, getResellerServices);

/*
--------------------------------
Update service visibility
--------------------------------
*/
router.patch("/visibility", protect, updateServiceVisibility);

/*
--------------------------------
Update service or category name
--------------------------------
*/
router.patch("/update", protect, updateServiceName);

/*
--------------------------------
Set reseller commission (applied to all services)
--------------------------------
*/
router.patch("/commission", protect, setResellerCommission);

export default router;
