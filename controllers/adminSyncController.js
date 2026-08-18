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
   ── SUMMARY ──
============================================================ */

// GET /api/admin/sync/summary
export const getSyncSummary = async (req, res) => {
  try {
    const [
      ordersActive, ordersPaused, ordersStopped, ordersTimedOut,
      refillsActive, refillsTimedOut, refillsStopped,
    ] = await Promise.all([
      Order.countDocuments({ status: { $in: ["pending", "processing"] }, syncPaused: { $ne: true } }),
      Order.countDocuments({ syncPaused: true, syncStopped: { $ne: true } }),
      Order.countDocuments({ syncStopped: true }),
      Order.countDocuments({ syncTimedOut: true }),
      Order.countDocuments({ refillRequested: true, refillStatus: { $in: ["pending", "processing"] }, refillProcessed: false }),
      Order.countDocuments({ refillTimedOut: true }),
      Order.countDocuments({ refillStatus: "stopped" }),
    ]);

    res.json({
      orders:  { active: ordersActive, paused: ordersPaused, stopped: ordersStopped, timedOut: ordersTimedOut },
      refills: { active: refillsActive, timedOut: refillsTimedOut, stopped: refillsStopped },
      totalActive: ordersActive + refillsActive, // what's actually still hitting the provider right now
    });
  } catch (err) {
    console.error("getSyncSummary:", err);
    res.status(500).json({ message: "Failed to fetch summary" });
  }
};

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
      delete query.$or;
      query.syncPaused = true;
      query.syncStopped = { $ne: true }; // "paused" tab excludes permanently-stopped ones
    } else if (status === "stopped") {
      delete query.$or;
      query.syncStopped = true;
    } else if (status === "timed_out") {
      delete query.$or;
      query.syncTimedOut = true;
    } else if (status) {
      delete query.$or;
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
      .select("orderId userId providerProfileId service status providerStatus providerOrderId quantityDelivered quantity syncPaused syncTimedOut syncTimedOutAt syncPausedAt syncStopped syncStoppedAt syncAdminNote createdAt isCharged refundProcessed");

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
    if (order.syncStopped) {
      return res.status(400).json({ message: "Order was permanently stopped" });
    }

    const syncPausedAt = new Date();
    const syncAdminNote = req.body.note || "Paused by admin";

    await order.updateOne({
      $set: { syncPaused: true, syncPausedAt, syncAdminNote },
    });

    res.json({
      message: "Order polling paused",
      order: { ...order.toObject(), syncPaused: true, syncPausedAt, syncAdminNote },
    });
  } catch (err) {
    console.error("pauseSyncOrder:", err);
    res.status(500).json({ message: "Failed to pause" });
  }
};

// POST /api/admin/sync/orders/:id/resume
// Works for BOTH manually-paused and auto-timed-out orders.
// Blocked ONLY for orders that were permanently Stopped.
export const resumeSyncOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (order.syncStopped) {
      return res.status(400).json({ message: "This order was permanently stopped and cannot be resumed" });
    }

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
    order.syncStopped = true;
    order.syncStoppedAt = new Date();
    order.syncAdminNote = req.body.note || "Stopped by admin";
    await order.save();

    res.json({ message: "Order sync stopped permanently", order });
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

// POST /api/admin/sync/orders/bulk-pause   body: { ids: [...] } or { all: true }
export const bulkPauseSyncOrders = async (req, res) => {
  try {
    const { ids, all, note } = req.body;
    const filter = all
      ? { status: { $in: ["pending", "processing"] }, syncPaused: { $ne: true } }
      : { _id: { $in: ids || [] }, syncStopped: { $ne: true } };

    const result = await Order.updateMany(filter, {
      $set: {
        syncPaused: true,
        syncPausedAt: new Date(),
        syncAdminNote: note || "Bulk paused by admin",
      },
    });

    res.json({ message: `Paused ${result.modifiedCount} order(s)`, modified: result.modifiedCount });
  } catch (err) {
    res.status(500).json({ message: "Bulk pause failed" });
  }
};

// POST /api/admin/sync/orders/bulk-resume   body: { ids: [...] }
// Same rule as single resume: stopped orders are excluded, timed-out ones are included.
export const bulkResumeSyncOrders = async (req, res) => {
  try {
    const { ids, note } = req.body;
    if (!ids?.length) return res.status(400).json({ message: "No order IDs provided" });

    const result = await Order.updateMany(
      { _id: { $in: ids }, syncStopped: { $ne: true } },
      {
        $set: {
          syncPaused: false,
          syncTimedOut: false,
          syncTimedOutAt: null,
          syncAdminNote: note || "Bulk resumed by admin",
        },
      }
    );

    res.json({ message: `Resumed ${result.modifiedCount} order(s)`, modified: result.modifiedCount });
  } catch (err) {
    res.status(500).json({ message: "Bulk resume failed" });
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
    if (order.refillStatus === "stopped") return res.status(400).json({ message: "Refill was permanently stopped" });

    order.refillProcessed = true;
    order.refillAdminNote = req.body.note || "Paused by admin";
    await order.save();

    res.json({ message: "Refill polling paused", order });
  } catch (err) {
    res.status(500).json({ message: "Failed to pause refill" });
  }
};

// POST /api/admin/sync/refills/:id/resume
// Works for auto-timed-out refills too (refillTimedOut). Blocked only for "stopped" or "completed".
export const resumeRefill = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order?.refillRequested) return res.status(404).json({ message: "Not found" });
    if (order.refillStatus === "completed") return res.status(400).json({ message: "Already completed" });
    if (order.refillStatus === "stopped") {
      return res.status(400).json({ message: "This refill was permanently stopped and cannot be resumed" });
    }
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
