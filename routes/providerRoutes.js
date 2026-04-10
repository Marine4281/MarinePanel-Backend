import express from "express";
import {
fetchProviderServices,
getSavedProviderServices,
toggleProviderServiceStatus,
deleteProviderService,
saveProviderProfile,
getProviderProfiles,
importSelectedServices,
importCategoryServices,
} from "../controllers/providerController.js";

import { updateProviderProfile } from "../controllers/ProviderProfileController.js";


const router = express.Router();

/*

Provider Services (External Provider API)

*/

/* Fetch services from provider API (NOT saved) */
router.post("/services", fetchProviderServices);

/* Get services already imported into panel */
router.get("/services/saved", getSavedProviderServices);

/* Toggle imported provider service visibility */
router.patch("/services/:id/toggle", toggleProviderServiceStatus);

/* Delete imported provider service */
router.delete("/services/:id", deleteProviderService);

/*

Provider Profiles

*/

/* Save provider profile */
router.post("/profiles", saveProviderProfile);

/* Get saved provider profiles */
router.get("/profiles", getProviderProfiles);

/*

Import Controls

*/

/* Import selected services */
router.post("/import-selected", importSelectedServices);

/* Import services by category */
router.post("/import-category", importCategoryServices);

//Update provider
router.put("/profiles/:id", updateProviderProfile);


export default router;
