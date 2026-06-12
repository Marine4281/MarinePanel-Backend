import express from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { apiV2 } from "../controllers/apiV2Controller.js";

const router = express.Router();

// Dedicated rate limiter for the SMM API (v2)
// - Keyed by API key (falls back to IP if no key provided)
// - 180 requests/minute per key — generous for status polling,
//   bulk order placement, and multi-order status checks
const apiV2Limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 180,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const key = req.body?.key;
    if (key && typeof key === "string" && key.trim()) {
      return `apikey:${key.trim()}`;
    }
    return ipKeyGenerator(req.ip);
  },
  handler: (req, res) => {
    return res
      .status(429)
      .json({ error: "Rate limit exceeded. Please slow down your requests." });
  },
});

router.post("/", apiV2Limiter, apiV2);

export default router;
