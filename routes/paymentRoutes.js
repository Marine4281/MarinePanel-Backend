const express = require("express");
const router = express.Router();
const { initializePaystack, handlePaystackWebhook } = require("../controllers/paymentController");
const protect = require("../middleware/authMiddleware");

// Initialize payment (protected route)
router.post("/initialize", protect, initializePaystack);

// Webhook (NO protect middleware!)
router.post("/webhook/paystack", express.json({ verify: (req, res, buf) => { req.rawBody = buf } }), handlePaystackWebhook);

module.exports = router;
