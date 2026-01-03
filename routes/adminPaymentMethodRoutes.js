import express from "express";
import {
  getAllPaymentMethods,
  addPaymentMethod,
  updatePaymentMethod,
  togglePaymentMethod,
} from "../controllers/paymentMethodController.js";

const router = express.Router();

// GET all methods
router.get("/", getAllPaymentMethods);

// POST add method
router.post("/", addPaymentMethod);

// PATCH update method
router.patch("/:id", updatePaymentMethod);

// PATCH toggle visibility
router.patch("/toggle/:id", togglePaymentMethod);

export default router;