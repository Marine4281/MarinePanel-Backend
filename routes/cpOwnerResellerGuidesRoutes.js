// routes/cpOwnerResellerGuidesRoutes.js
import express from "express";
import {
  getCPResellerGuides,
  createCPResellerGuide,
  updateCPResellerGuide,
  deleteCPResellerGuide,
} from "../controllers/cpOwnerResellerGuidesController.js";

const router = express.Router();
// Auth + cpOwnerOnly applied in app.js

router.get("/",       getCPResellerGuides);
router.post("/",      createCPResellerGuide);
router.put("/:id",    updateCPResellerGuide);
router.delete("/:id", deleteCPResellerGuide);

export default router;
