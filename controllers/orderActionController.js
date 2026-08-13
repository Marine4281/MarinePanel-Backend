// controllers/orderActionController.js

import Order from "../models/Order.js";
import Wallet from "../models/Wallet.js";
import ProviderProfile from "../models/ProviderProfile.js";
import { callProvider } from "../utils/providerApi.js";
import {
  reverseResellerCommission,
  reverseChildPanelCommission,
  reverseAdminRevenue,
} from "./orderController.js";

const calculateBalance = (transactions = []) =>
  transactions.reduce((acc, t) => acc + (Number(t.amount) || 0), 0);

/* =========================================================
   🔧 HELPER: GET PROVIDER (SAFE + FUTURE PROOF)
========================================================= */
const getProvider = async (order) => {
  if (!order.providerProfileId) return null;
  const provider = await ProviderProfile.findById(order.providerProfileId);
  return provider || null;
};

/* =========================================================
   🔧 HELPER: OWNERSHIP CHECK
   Covers both regular users and CP end-users whose orders
   are stored under userId = cpOwner but endUserId = them.
========================================================= */
const isOrderOwner = (order, userId) => {
  const uid = userId.toString();
  if (order.userId.toString() === uid) return true;
  if (order.endUserId && order.endUserId.toString() === uid) return true;
  return false;
};

/* =========================================================
   🔧 HELPER: REFUND + REVERSE ON SUCCESSFUL CANCEL
   Refunds the payer for whatever wasn't delivered yet, and
   reverses reseller/CP/admin commission proportionally.
   Mirrors the pattern in AdminUserOrdersController.js /
   providerStatusSync.js / smmWebhookController.js.
========================================================= */
const processCancelRefund = async (order) => {
  if (order.isFreeOrder || !order.isCharged || order.refundProcessed) {
    return null;
  }

  const quantity = Number(order.quantity || 0);
  const delivered = Number(order.quantityDelivered || 0);
  const remaining = quantity - delivered;

  if (remaining <= 0) {
    order.refundProcessed = true;
    await order.save();
    return null;
  }

  const payerId = order.endUserId || order.userId;
  if (!payerId) return null;

  const wallet = await Wallet.findOne({ user: payerId });
  if (!wallet) return null;

  const alreadyRefunded = wallet.transactions.some(
    (t) => t.type === "Refund" && t.reference?.toString() === order._id.toString()
  );
  if (alreadyRefunded) {
    order.refundProcessed = true;
    await order.save();
    return null;
  }

  const charge = Number(order.charge || 0);
  const refundAmount = Number(((remaining / quantity) * charge).toFixed(4));

  if (refundAmount > 0) {
    wallet.transactions.push({
      type: "Refund",
      amount: refundAmount,
      status: "Completed",
      note: `Refund - Cancelled order #${order.orderId} (${remaining} undelivered)`,
      reference: order._id,
      createdAt: new Date(),
    });
    wallet.balance = calculateBalance(wallet.transactions);
    await wallet.save();
  }

  order.refundProcessed = true;
  await order.save();

  const ratio = charge > 0 ? refundAmount / charge : 1;
  await reverseResellerCommission(order, ratio);
  await reverseChildPanelCommission(order, ratio);
  await reverseAdminRevenue(order, ratio);

  return { refundAmount, walletBalance: wallet.balance, walletUserId: payerId };
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

    if (!isOrderOwner(order, req.user._id)) {
      return res.status(403).json({ message: "Unauthorized" });
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

    const providerOrderId = String(order.providerOrderId || "").trim();

    if (!providerOrderId) {
      return res.status(400).json({
        message: "Invalid provider order ID",
      });
    }

    const response = await callProvider(provider, {
      action: "cancel",
      orders: providerOrderId,
    });

    const cancelResult =
      response?.[0]?.cancel ??
      response?.cancel ??
      null;

    const isSuccess = cancelResult === 1 || cancelResult === true;

    order.cancelRequested = true;
    order.cancelRequestedAt = new Date();
    order.cancelStatus = isSuccess ? "success" : "failed";
    order.cancelProcessed = true;

    if (isSuccess) {
      order.status = "cancelled";
    }

    order.cancelResponse = response;

    await order.save();

    // ─── REFUND + COMMISSION/REVENUE REVERSAL ─────────────────────────
    // Only on a successful provider cancel — a failed cancel request
    // means the order is still live with the provider, nothing to refund.
    let refundData = null;
    if (isSuccess) {
      refundData = await processCancelRefund(order);
    }

    const io = req.app.get("io");
    if (io) {
      io.emit("order:update", {
        _id: order._id,
        status: order.status,
        quantityDelivered: order.quantityDelivered,
        refundProcessed: order.refundProcessed || false,
      });

      const notifyUserId = order.endUserId || order.userId;
      if (notifyUserId) {
        io.to(notifyUserId.toString()).emit("orderUpdated", {
          orderId: order._id,
          status: order.status,
          providerStatus: order.providerStatus || order.status,
          delivered: order.quantityDelivered,
          total: order.quantity,
          refundProcessed: order.refundProcessed || false,
        });
      }

      if (refundData) {
        io.emit("wallet:update", {
          userId: refundData.walletUserId,
          balance: refundData.walletBalance,
        });
      }
    }

    res.json({
      message: isSuccess
        ? "Order cancelled successfully"
        : "Cancel request failed",
      success: isSuccess,
      response,
      refundAmount: refundData?.refundAmount || 0,
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

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (!isOrderOwner(order, req.user._id)) {
      return res.status(403).json({ message: "Unauthorized" });
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
       🔥 REFILL EXPIRY POLICY
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
       🔥 SAFE REFILL ID EXTRACTION
    ========================================================= */

    let refillId =
      response?.refill ||
      response?.data?.refill ||
      (Array.isArray(response) ? response?.[0]?.refill : null);

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
