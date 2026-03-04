import express from "express";
import {
  getAllServices,
  addService,
  updateService,
  deleteService,
  toggleServiceStatus,
} from "../controllers/adminServiceControllers.js";
import { protect } from "../middlewares/authMiddleware.js";
import { adminOnly } from "../middlewares/adminMiddleware.js";

const router = express.Router();

// All routes protected and admin-only
router.use(protect, adminOnly);

// GET all services
router.get("/", getAllServices);

//Toggle visibility 
router.patch("/:id/toggle", toggleServiceStatus);

// POST add new service
router.post("/", addService);

// PUT update service by id
router.put("/:id", updateService);

// DELETE service by id
router.delete("/:id", deleteService);

export default router;
