// controllers/orderActionController.js

import Order from "../models/Order.js";
import ProviderProfile from "../models/ProviderProfile.js";
import { callProvider } from "../utils/providerApi.js";
import ServiceSettings from "../models/ServiceSettings.js";

/* =========================================================
   🔧 HELPER: GET PROVIDER (SAFE + FUTURE PROOF)
========================================================= */
const getProvider = async (order) => {
  if (!order.providerProfileId) return null;

  const provider = await ProviderProfile.findById(order.providerProfileId);
  return provider || null;
};

/* =========================================================
   CANCEL ORDER
========================================================= */
export const cancelOrder = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (order.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Unauthorized" });
    }
     // 🔥 GLOBAL REFILL GUARD (NEW)
    const settings = await ServiceSettings.findOne();
    if (settings && settings.globalRefillEnabled === false) {
      return res.status(403).json({
        message: "Refill is currently disabled by admin",
      });
    }

    if (order.cancelRequested) {
      return res.status(400).json({ message: "Cancel already requested" });
    }

    if (order.status === "completed") {
      return res.status(400).json({ message: "Cannot cancel completed order" });
    }

    if (!order.cancelAllowed) {
      return res.status(400).json({
        message: "Cancel not supported for this service",
      });
    }

    const provider = await getProvider(order);

    if (!provider) {
      return res.status(400).json({
        message: "Provider not found (invalid providerProfileId on order)",
      });
    }

    // ✅ Ensure valid provider order ID
    const providerOrderId = String(order.providerOrderId || "").trim();

    if (!providerOrderId) {
      return res.status(400).json({
        message: "Invalid provider order ID",
      });
    }

    // 🔥 Send cancel request (ONE-TIME action)
    const response = await callProvider(provider, {
      action: "cancel",
      orders: providerOrderId,
    });

    // 🔥 Normalize response safely
    const cancelResult =
      response?.[0]?.cancel ??
      response?.cancel ??
      null;

    const isSuccess = cancelResult === 1 || cancelResult === true;

    // ✅ FINAL STATE (no fake pending/processing)
    order.cancelRequested = true;
    order.cancelRequestedAt = new Date();
    order.cancelStatus = isSuccess ? "success" : "failed";
    order.cancelProcessed = true;

    // ✅ If success → reflect immediately in system
    if (isSuccess) {
      order.status = "cancelled";
    }

    // Store raw provider response for debugging/audit
    order.cancelResponse = response;

    await order.save();

    res.json({
      message: isSuccess
        ? "Order cancelled successfully"
        : "Cancel request failed",
      success: isSuccess,
      response,
    });

  } catch (error) {
    console.error("Cancel Order Error:", error);

    res.status(500).json({
      message: "Cancel request failed",
      error: error.message,
    });
  }
};

/* =========================================================
   REFILL ORDER
========================================================= */
export const refillOrder = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId);

    /* =========================================================
       ❌ VALIDATIONS
    ========================================================= */

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (order.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Unauthorized" });
    }

     // 🔥 GLOBAL REFILL GUARD (NEW)
    const settings = await ServiceSettings.findOne();
    if (settings && settings.globalRefillEnabled === false) {
      return res.status(403).json({
        message: "Refill is currently disabled by admin",
      });
    }

    if (order.refillRequested) {
      return res.status(400).json({ message: "Refill already requested" });
    }

    if (order.status === "cancelled") {
      return res.status(400).json({
        message: "Cannot refill cancelled order",
      });
    }

    if (!["completed", "partial"].includes(order.status)) {
      return res.status(400).json({
        message: "Order not eligible for refill",
      });
    }

    if (!order.refillAllowed) {
      return res.status(400).json({
        message: "Refill not supported for this service",
      });
    }

    /* =========================================================
       🔥 REFILL EXPIRY POLICY (NEW - CRITICAL)
    ========================================================= */

    const orderAgeDays =
      (Date.now() - new Date(order.createdAt)) / (1000 * 60 * 60 * 24);

    if (order.refillPolicy !== "lifetime") {
      if (order.refillPolicy === "30d" && orderAgeDays > 30) {
        return res.status(400).json({ message: "Refill expired (30 days)" });
      }

      if (order.refillPolicy === "60d" && orderAgeDays > 60) {
        return res.status(400).json({ message: "Refill expired (60 days)" });
      }

      if (order.refillPolicy === "90d" && orderAgeDays > 90) {
        return res.status(400).json({ message: "Refill expired (90 days)" });
      }

      if (order.refillPolicy === "365d" && orderAgeDays > 365) {
        return res.status(400).json({ message: "Refill expired (365 days)" });
      }

      if (
        order.refillPolicy === "custom" &&
        order.customRefillDays &&
        orderAgeDays > order.customRefillDays
      ) {
        return res.status(400).json({
          message: `Refill expired (${order.customRefillDays} days)`,
        });
      }
    }

    /* =========================================================
       🔧 PROVIDER VALIDATION
    ========================================================= */

    const provider = await getProvider(order);

    if (!provider) {
      return res.status(400).json({
        message: "Provider not found (invalid providerProfileId on order)",
      });
    }

    const providerOrderId = String(order.providerOrderId || "").trim();

    if (!providerOrderId) {
      return res.status(400).json({
        message: "Invalid provider order ID",
      });
    }

    /* =========================================================
       🚀 CALL PROVIDER
    ========================================================= */

    const response = await callProvider(provider, {
      action: "refill",
      order: providerOrderId,
    });

    /* =========================================================
       🔥 SAFE REFILL ID EXTRACTION (PRODUCTION SAFE)
    ========================================================= */

    let refillId =
      response?.refill ||
      response?.data?.refill ||
      (Array.isArray(response) ? response?.[0]?.refill : null);

    // normalize to string
    if (refillId !== null && refillId !== undefined) {
      refillId = String(refillId);
    }

    if (!refillId) {
      return res.status(400).json({
        message: "Provider did not return refill ID",
        response,
      });
    }

    /* =========================================================
       💾 UPDATE ORDER
    ========================================================= */

    order.refillRequested = true;
    order.refillRequestedAt = new Date();

    order.refillStatus = "pending";
    order.refillProcessed = false;

    order.refillId = refillId;

    order.refillResponse = response;

    await order.save();

    /* =========================================================
       ✅ RESPONSE
    ========================================================= */

    res.json({
      message: "Refill request sent successfully",
      refillId,
      status: "pending",
    });

  } catch (error) {
    console.error("Refill Order Error:", error);

    res.status(500).json({
      message: "Refill request failed",
      error: error.message,
    });
  }
};
