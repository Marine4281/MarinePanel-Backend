// routes/cpOwnerCategoryRoutes.js
import express from "express";
import {
  getCPCategoryMeta,
  saveCPCategoryMeta,
  getCPCategoryServices,
} from "../controllers/cpOwnerCategoryController.js";

const router = express.Router();

router.get("/",                          getCPCategoryMeta);
router.post("/",                         saveCPCategoryMeta);
router.get("/:category/services",        getCPCategoryServices);

export default router;
