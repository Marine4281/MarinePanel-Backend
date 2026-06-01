import express from "express";
import { getCategoryMeta, saveCategoryMeta , getCategoryServices} from "../controllers/categoryMetaController.js";
import { protect } from "../middlewares/authMiddleware.js";
import { adminOnly } from "../middlewares/adminMiddleware.js";

const router = express.Router();

router.get("/", getCategoryMeta);                          // public — home page uses this
router.post("/", protect, adminOnly, saveCategoryMeta);    // admin only
router.get("/:category/services",     getCategoryServices);

export default router;
