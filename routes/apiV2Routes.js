import express from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { apiV2 } from "../controllers/apiV2Controller.js";
import Settings from "../models/Settings.js";

const router = express.Router();

// Cache the configured limit so we don't hit the DB on every request.
// Refreshed every 30s; admin changes take effect within that window.
let cachedMax = 180;
setInterval(async () => {
  try {
    const settings = await Settings.findOne().lean();
    if (settings?.apiRateLimitPerMinute) cachedMax = settings.apiRateLimitPerMinute;
  } catch {
    // keep last known value on error
  }
}, 30 * 1000);

const apiV2Limiter = rateLimit({
  windowMs: 60 * 1000,
  max: () => cachedMax,
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
