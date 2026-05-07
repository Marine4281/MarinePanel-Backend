import express from "express";
import { apiV2 } from "../controllers/apiV2Controller.js";

const router = express.Router();

router.post("/", apiV2);

export default router;
