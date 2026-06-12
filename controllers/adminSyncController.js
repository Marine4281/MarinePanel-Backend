// controllers/adminSyncController.js

import Order from "../models/Order.js";
import ProviderProfile from "../models/ProviderProfile.js";
import { callProvider } from "../utils/providerApi.js";
import axios from "axios";
import { mapProviderStatus, calculateDelivered } from "../utils/providerStatusMapper.js";

/* ============================================================
   SHARED HELPERS
============================================================ */
const parseQuery = (req) => ({
  page:   Math.max(1, Number(req.query.page) || 1),
  limit:  Math.min(50, Number(req.query.limit) || 20),
  search: req.query.search?.trim() || "",
  status: req.query.status?.trim() || "",
});

/* ============================================================
   ── ORDERS ──
============================================================ */

// GET /api/admin/sync/orders
export const getSyncOrders = async (req, res) => {
  try {
    const { page, limit, search, status } = parseQuery(req);

    const query = {
      providerOrderId: { $ne: "" },
      $or: [
        { status: { $in: ["pending", "processing", "partial", "failed"] } },
        { syncPaused: true },
        { syncTimedOut: true },
      ],
    };

    if (status === "active") {
      query.$or = [{ status: { $in: ["pending", "processing"] }, syncPaused: { $ne: true } }];
    } else if (status === "paused") {
      query.$or = undefined;
      query.syncPaused = true;
    } else if (status === "timed_out") {
      query.$or = undefined;
      query.syncTimedOut = true;
    } else if (status) {
      query.$or = undefined;
      query.status = status;
    }

    if (search) {
      query.$and = [{ $or: [
        { orderId: { $regex: search, $options: "i" } },
        { providerOrderId: { $regex: search, $options: "i" } },
      ]}];
    }

    const total = await Order.countDocuments(query);
    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("userId", "email")
      .populate("providerProfileId", "name")
      .select("orderId userId providerProfileId service status providerStatus providerOrderId quantityDelivered quantity syncPaused syncTimedOut syncTimedOutAt syncPausedAt syncAdminNote createdAt isCharged refundProcessed");

    res.json({ orders, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error("getSyncOrders:", err);
    res.status(500).json({ message: "Failed to fetch orders" });
  }
};

// POST /api/admin/sync/orders/:id/pause
export const pauseSyncOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (["completed", "cancelled", "refunded"].includes(order.status)) {
      return res.status(400).json({ message: "Order is in a final state" });
    }

    order.syncPaused = true;
    order.syncPausedAt = new Date();
    order.syncAdminNote = req.body.note || "Paused by admin";
    await order.save();

    res.json({ message: "Order polling paused", order });
  } catch (err) {
    res.status(500).json({ message: "Failed to pause" });
  }
};

// POST /api/admin/sync/orders/:id/resume
export const resumeSyncOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    order.syncPaused = false;
    order.syncTimedOut = false;
    order.syncTimedOutAt = null;
    order.syncAdminNote = req.body.note || "Resumed by admin";
    await order.save();

    res.json({ message: "Order polling resumed", order });
  } catch (err) {
    res.status(500).json({ message: "Failed to resume" });
  }
};

// POST /api/admin/sync/orders/:id/stop
export const stopSyncOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    order.syncPaused = true;
    order.status = "cancelled";
    order.syncAdminNote = req.body.note || "Stopped by admin";
    await order.save();

    res.json({ message: "Order stopped", order });
  } catch (err) {
    res.status(500).json({ message: "Failed to stop" });
  }
};

// POST /api/admin/sync/orders/:id/force-check
export const forceCheckOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate("providerProfileId");
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (!order.providerOrderId) return res.status(400).json({ message: "No provider order ID" });

    const profile = order.providerProfileId;
    if (!profile?.apiUrl) return res.status(400).json({ message: "Provider not configured" });

    const response = await axios.post(
      profile.apiUrl,
      { key: profile.apiKey, action: "status", orders: order.providerOrderId },
      { timeout: 15000 }
    );

    const providerOrder = response.data?.[order.providerOrderId];
    if (!providerOrder || providerOrder.error) {
      return res.json({ message: "No data from provider", raw: response.data });
    }

    const rawStatus = providerOrder.status || "";
    let mappedStatus = mapProviderStatus(rawStatus.toLowerCase().replace(/\s+/g, "").trim());
    if (providerOrder.remains == 0 && mappedStatus === "processing") mappedStatus = "completed";

    order.status = mappedStatus;
    order.quantityDelivered = calculateDelivered(order.quantity, providerOrder.remains);
    order.providerStatus = rawStatus.toLowerCase();
    await order.save();

    res.json({ message: "Force check complete", status: mappedStatus, raw: providerOrder });
  } catch (err) {
    console.error("forceCheckOrder:", err);
    res.status(500).json({ message: "Force check failed", error: err.message });
  }
};

/* ============================================================
   ── REFILLS ──
============================================================ */

// GET /api/admin/sync/refills
export const getSyncRefills = async (req, res) => {
  try {
    const { page, limit, search, status } = parseQuery(req);

    const query = { refillRequested: true };

    if (status === "active") {
      query.refillStatus = { $in: ["pending", "processing"] };
      query.refillProcessed = false;
    } else if (status === "timed_out") {
      query.refillTimedOut = true;
    } else if (status === "stopped") {
      query.refillStatus = "stopped";
    } else if (status === "completed") {
      query.refillStatus = "completed";
    } else if (status === "rejected") {
      query.refillStatus = "rejected";
    }

    if (search) {
      query.$or = [
        { orderId: { $regex: search, $options: "i" } },
        { refillId: { $regex: search, $options: "i" } },
      ];
    }

    const total = await Order.countDocuments(query);
    const orders = await Order.find(query)
      .sort({ refillRequestedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("userId", "email")
      .populate("providerProfileId", "name")
      .select("orderId userId providerProfileId service refillId refillStatus refillProcessed refillTimedOut refillTimedOutAt refillRequestedAt refillCompletedAt refillRejectedAt refillAdminNote refillResponse");

    res.json({ orders, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch refills" });
  }
};

// POST /api/admin/sync/refills/:id/pause
export const pauseRefill = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order?.refillRequested) return res.status(404).json({ message: "Not found" });
    if (order.refillStatus === "completed") return res.status(400).json({ message: "Already completed" });

    order.refillProcessed = true;
    order.refillAdminNote = req.body.note || "Paused by admin";
    await order.save();

    res.json({ message: "Refill polling paused", order });
  } catch (err) {
    res.status(500).json({ message: "Failed to pause refill" });
  }
};

// POST /api/admin/sync/refills/:id/resume
export const resumeRefill = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order?.refillRequested) return res.status(404).json({ message: "Not found" });
    if (order.refillStatus === "completed") return res.status(400).json({ message: "Already completed" });
    if (!order.refillId) return res.status(400).json({ message: "No refill ID" });

    order.refillProcessed = false;
    order.refillTimedOut = false;
    order.refillTimedOutAt = null;
    order.refillStatus = "pending";
    order.refillRequestedAt = new Date(); // fresh 48h window
    order.refillAdminNote = req.body.note || "Resumed by admin";
    await order.save();

    res.json({ message: "Refill re-queued for polling", order });
  } catch (err) {
    res.status(500).json({ message: "Failed to resume refill" });
  }
};

// POST /api/admin/sync/refills/:id/stop
export const stopRefill = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order?.refillRequested) return res.status(404).json({ message: "Not found" });
    if (order.refillStatus === "completed") return res.status(400).json({ message: "Already completed" });

    order.refillProcessed = true;
    order.refillStatus = "stopped";
    order.refillAdminNote = req.body.note || "Stopped by admin";
    await order.save();

    res.json({ message: "Refill stopped", order });
  } catch (err) {
    res.status(500).json({ message: "Failed to stop refill" });
  }
};

// POST /api/admin/sync/refills/:id/force-check
export const forceCheckRefill = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate("providerProfileId");
    if (!order?.refillRequested) return res.status(404).json({ message: "Not found" });
    if (!order.refillId) return res.status(400).json({ message: "No refill ID" });

    const profile = order.providerProfileId;
    if (!profile?.apiUrl) return res.status(400).json({ message: "Provider not configured" });

    const response = await callProvider(profile, {
      action: "refill_status",
      refill: order.refillId,
    });

    const status = String(response?.status || response?.[0]?.status || "").toLowerCase();

    if (status) {
      order.refillStatus = status;
      order.refillResponse = response;
      if (status === "completed") { order.refillProcessed = true; order.refillCompletedAt = new Date(); }
      if (["rejected", "failed"].includes(status)) { order.refillProcessed = true; order.refillRejectedAt = new Date(); }
      await order.save();
    }

    res.json({ message: "Force check complete", status: status || "unknown", raw: response });
  } catch (err) {
    res.status(500).json({ message: "Force check failed", error: err.message });
  }
};

/* ============================================================
   ── CANCELS ──
============================================================ */

// GET /api/admin/sync/cancels
export const getSyncCancels = async (req, res) => {
  try {
    const { page, limit, search, status } = parseQuery(req);

    const query = { cancelRequested: true };

    if (status === "success")  query.cancelStatus = "success";
    if (status === "failed")   query.cancelStatus = "failed";
    if (status === "none")     query.cancelStatus = "none";

    if (search) {
      query.$or = [
        { orderId: { $regex: search, $options: "i" } },
        { providerOrderId: { $regex: search, $options: "i" } },
      ];
    }

    const total = await Order.countDocuments(query);
    const orders = await Order.find(query)
      .sort({ cancelRequestedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("userId", "email")
      .populate("providerProfileId", "name")
      .select("orderId userId providerProfileId service status cancelStatus cancelRequested cancelRequestedAt cancelProcessed providerOrderId");

    res.json({ orders, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch cancels" });
  }
};
