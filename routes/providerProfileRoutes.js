//routes/providerProfileRoutes.js
import express from "express";
import {
  createProviderProfile,
  getProviderProfiles,
  deleteProviderProfile,
} from "../controllers/ProviderProfileController.js";

const router = express.Router();

// CREATE provider
router.post("/profiles", createProviderProfile);

// GET all providers
router.get("/profiles", getProviderProfiles);

// DELETE provider
router.delete("/profiles/:id", deleteProviderProfile);

export default router;
