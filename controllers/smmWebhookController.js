import Order from "../models/Order.js";
import Wallet from "../models/Wallet.js";
import {
  reverseResellerCommission,
  reverseChildPanelCommission,
  reverseAdminRevenue,
} from "./orderController.js";

/**
 * Universal provider status normalizer
 * Works with ANY provider wording
 */
const normalizeStatus = (providerStatus = "") => {
  const s = providerStatus.toLowerCase().trim();

  if (["pending", "waiting"].includes(s)) return "pending";

  if (
    ["processing", "in progress", "inprogress", "partial", "running"].includes(
      s
    )
  )
    return "processing";

  if (["completed", "complete", "done", "success"].includes(s))
    return "completed";

  if (["cancelled", "canceled"].includes(s))
    return "cancelled";

  if (["failed", "fail", "error"].includes(s))
    return "failed";

  if (["refunded", "refund"].includes(s))
    return "refunded";

  return "pending"; // safe fallback
};

const calculateBalance = (transactions = []) =>
  transactions.reduce((acc, t) => acc + (Number(t.amount) || 0), 0);

/* ============================================================
   HELPER: refund the payer + reverse commissions/revenue for
   a terminal negative status (failed / refunded / cancelled).
   Refunds proportionally to whatever was NOT delivered, so a
   provider that reports quantityDelivered before failing only
   gets the undelivered portion refunded/reversed — mirrors the
   logic in services/providerStatusSync.js.
============================================================ */
const processWebhookRefund = async (order) => {
  if (order.isFreeOrder || !order.isCharged || order.refundProcessed) {
    return;
  }

  const quantity = Number(order.quantity || 0);
  const delivered = Number(order.quantityDelivered || 0);
  const remaining = quantity - delivered;

  if (remaining <= 0) {
    // Fully delivered already — nothing to refund/reverse, just close it out.
    order.refundProcessed = true;
    await order.save();
    return;
  }

  const payerId = order.endUserId || order.userId;
  if (!payerId) return;

  const wallet = await Wallet.findOne({ user: payerId });
  if (!wallet) return;

  const alreadyRefunded = wallet.transactions.some(
    (t) => t.type === "Refund" && t.reference?.toString() === order._id.toString()
  );
  if (alreadyRefunded) {
    order.refundProcessed = true;
    await order.save();
    return;
  }

  const charge = Number(order.charge || 0);
  const refundAmount = Number(((remaining / quantity) * charge).toFixed(4));

  if (refundAmount > 0) {
    wallet.transactions.push({
      type: "Refund",
      amount: refundAmount,
      status: "Completed",
      note: `Webhook refund - #${order.customOrderId} (${remaining} undelivered)`,
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
};

export const smmWebhook = async (req, res) => {
  try {
    console.log("📩 Webhook received:", req.body);

    // Detect provider order ID dynamically
    const providerOrderId =
      req.body.order ||
      req.body.order_id ||
      req.body.id;

    if (!providerOrderId) {
      return res.status(400).json({
        message: "Missing provider order ID",
      });
    }

    // Find order using providerOrderId (NOT your internal orderId)
    const order = await Order.findOne({ providerOrderId });

    if (!order) {
      console.log("❌ Order not found:", providerOrderId);
      return res.status(404).json({
        message: "Order not found",
      });
    }

    const providerStatus = req.body.status || "";

    order.status = normalizeStatus(providerStatus);
    order.providerStatus = providerStatus;

    if (req.body.quantityDelivered !== undefined) {
      order.quantityDelivered = req.body.quantityDelivered;
    }

    await order.save();

    // ─── REFUND + COMMISSION/REVENUE REVERSAL ─────────────────────────
    // Terminal negative statuses need the undelivered portion refunded
    // to the payer and reseller/CP/admin earnings reversed accordingly.
    if (["failed", "refunded", "cancelled"].includes(order.status)) {
      await processWebhookRefund(order);
    }

    const io = req.app.get("io");

    if (io) {
      io.emit("order:update", {
        _id: order._id,
        orderId: order.orderId,
        status: order.status,
        providerStatus: order.providerStatus,
        quantity: order.quantity,
        quantityDelivered: order.quantityDelivered,
        charge: order.charge,
        refundProcessed: order.refundProcessed || false,
      });

      const notifyUserId = order.endUserId || order.userId;
      if (notifyUserId) {
        io.to(notifyUserId.toString()).emit("orderUpdated", {
          orderId: order._id,
          status: order.status,
          providerStatus: order.providerStatus,
          delivered: order.quantityDelivered,
          total: order.quantity,
          refundProcessed: order.refundProcessed || false,
        });
      }

      if (order.refundProcessed) {
        io.emit("wallet:update", {
          userId: order.endUserId || order.userId,
        });
      }
    }

    console.log("✅ Order updated:", order.orderId);

    res.status(200).json({ message: "Webhook processed successfully" });
  } catch (error) {
    console.error("🚨 Webhook error:", error);
    res.status(500).json({ message: "Webhook failed" });
  }
};
