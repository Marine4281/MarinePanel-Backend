// controllers/apiV2Controller.js
import User from "../models/User.js";
import Settings from "../models/Settings.js";
import { logApiCall } from "../utils/apiLogger.js";

import { handleServices } from "./apiV2/actions/services.js";
import { handleAdd } from "./apiV2/actions/add.js";
import { handleStatus } from "./apiV2/actions/status.js";
import { handleRefill } from "./apiV2/actions/refill.js";
import { handleRefillStatus } from "./apiV2/actions/refillStatus.js";
import { handleCancel } from "./apiV2/actions/cancel.js";
import { handleBalance } from "./apiV2/actions/balance.js";

export const apiV2 = async (req, res) => {
  const { key, action } = req.body;
  const startedAt = Date.now();

  // Wrap res.json so every response path (across every split action)
  // gets logged without threading logging through each handler.
  let loggedUser = null;
  const originalJson = res.json.bind(res);
  res.json = (payload) => {
    logApiCall({
      user: loggedUser,
      key,
      action,
      success: !payload?.error,
      errorMessage: payload?.error || null,
      ip: req.ip,
      durationMs: Date.now() - startedAt,
    });
    return originalJson(payload);
  };

  try {
    const user = await User.findOne({ apiKey: key });
    loggedUser = user;

    if (!user || !user.apiAccessEnabled) {
      return res.json({ error: "Invalid or disabled API key" });
    }

    const platformSettings = await Settings.findOne().lean();
    if (platformSettings && platformSettings.apiEnabled === false) {
      return res.json({ error: "API access is temporarily disabled" });
    }

    if (user.isBlocked || user.isFrozen) {
      return res.json({ error: "Account restricted" });
    }

    switch (action) {
      case "services":
        return await handleServices(req, res, user);

      case "add":
        return await handleAdd(req, res, user);

      case "status":
        return await handleStatus(req, res, user);

      case "refill":
        return await handleRefill(req, res, user);

      case "refill_status":
        return await handleRefillStatus(req, res, user);

      case "cancel":
        return await handleCancel(req, res, user);

      case "balance":
        return await handleBalance(req, res, user);

      default:
        return res.json({ error: "Invalid action" });
    }
  } catch (err) {
    console.error("❌ API v2 error:", err);
    return res.json({ error: "Server error" });
  }
};
