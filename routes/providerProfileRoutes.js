//routes/providerProfileRoutes.js
import express from "express";
import {
  createProviderProfile,
  getProviderProfiles,
  getProviderProfileById,
  updateProviderProfile,
  deleteProviderProfile,
} from "../controllers/ProviderProfileController.js";

const router = express.Router();

// CREATE provider
router.post("/profiles", createProviderProfile);

// GET all providers
router.get("/profiles", getProviderProfiles);

// GET single provider by ID
router.get("/profiles/:id", getProviderProfileById);

// UPDATE provider
router.put("/profiles/:id", updateProviderProfile);

// DELETE provider
router.delete("/profiles/:id", deleteProviderProfile);

export default router;
