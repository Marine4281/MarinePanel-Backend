//controllers/AdminUserOrdersController.js
import Order from "../models/Order.js";
import User from "../models/User.js";
import Wallet from "../models/Wallet.js";
import {
  creditResellerCommission,
  reverseResellerCommission,
} from "./orderController.js";

/* ======================================================
   HELPER: PROCESS REFUND
====================================================== */
const processRefund = async ({
  order,
  refundType = "full",
  customAmount = 0,
}) => {
  if (!order) return;

  if (order.isFreeOrder) return;

  if (order.refundProcessed) return;

  if (!order.isCharged) return;

  const wallet = await Wallet.findOne({
    user: order.userId,
  });

  if (!wallet) return;

  // prevent duplicate refund
  const alreadyRefunded = wallet.transactions.find(
    (t) =>
      t.reference?.toString() === order._id.toString() &&
      t.type === "Refund"
  );

  if (alreadyRefunded) return;

  let refundAmount = 0;

  // FULL REFUND
  if (refundType === "full") {
    refundAmount = Number(order.charge || 0);
  }

  // PARTIAL REFUND
  else if (refundType === "partial") {
    const remaining =
      Number(order.quantity || 0) -
      Number(order.quantityDelivered || 0);

    if (remaining <= 0) return;

    refundAmount =
      (remaining / Number(order.quantity || 1)) *
      Number(order.charge || 0);
  }

  // CUSTOM REFUND
  else if (refundType === "custom") {
    refundAmount = Number(customAmount || 0);

    if (refundAmount <= 0) return;
  }

  refundAmount = Number(refundAmount.toFixed(4));

  if (refundAmount <= 0) return;

  wallet.transactions.push({
    type: "Refund",
    amount: refundAmount,
    status: "Completed",
    note: `Refund for Order ${order.orderId}`,
    reference: order._id,
    createdAt: new Date(),
  });

  // safe recalc
  wallet.balance = wallet.transactions.reduce(
    (acc, t) => acc + (Number(t.amount) || 0),
    0
  );

  await wallet.save();

  order.refundProcessed = true;

  await order.save();

  // reverse reseller commission
  await reverseResellerCommission(order);

  return {
    refundAmount,
    walletBalance: wallet.balance,
    walletUserId: wallet.user,
  };
};

/* ======================================================
   GET ALL USER ORDERS (Search + Pagination)
====================================================== */
export const getAllOrders = async (req, res) => {
  try {
    const { search = "", page = 1, limit = 10 } = req.query;
    const pageNum = Number(page);
    const limitNum = Number(limit);

    // Base query:
    // Show orders that are either:
    //   (a) plain main-platform orders (no childPanelOwner field), OR
    //   (b) orders that have a childPanelOwner stamped (CP end-user orders)
    //       — these get collapsed to show the CP owner, not the end-user.
    // We exclude nothing here; instead we collapse in the map below.
    // The only orders we truly exclude are those placed by CP owners
    // acting as regular users on the main platform — those are included normally.
    let orderQuery = {
      // Exclude orders placed by users who belong to a child panel
      // but where the childPanelOwner was NOT stamped (legacy/broken orders).
      // We do this by excluding users whose userId has a childPanelOwner set.
      // We handle this via the search path below.
    };

    // Correct approach: show all orders EXCEPT those where userId itself
    // is a CP end-user (has childPanelOwner on their User doc) AND
    // childPanelOwner is not stamped on the order (un-stamped legacy orders).
    // For properly stamped orders (childPanelOwner exists), include them
    // and show CP owner as the display user.

    // Step 1: get all CP end-user IDs so we can exclude un-stamped orders
    const cpEndUserIds = await User.find({
      childPanelOwner: { $exists: true, $ne: null },
    }).distinct("_id");

    if (search) {
      const matchedUsers = await User.find({
        email: { $regex: search, $options: "i" },
        childPanelOwner: { $exists: false },
      }).select("_id");

      const userIds = matchedUsers.map((u) => u._id);
      const orQueries = [];

      if (userIds.length > 0) orQueries.push({ userId: { $in: userIds } });
      if (mongoose.Types.ObjectId.isValid(search)) orQueries.push({ _id: search });
      orQueries.push({ orderId: { $regex: search, $options: "i" } });

      orderQuery = {
        // Exclude un-stamped CP end-user orders
        $nor: [
          {
            userId: { $in: cpEndUserIds },
            childPanelOwner: { $exists: false },
          },
        ],
        $or: orQueries,
      };
    } else {
      orderQuery = {
        // Exclude un-stamped CP end-user orders
        $nor: [
          {
            userId: { $in: cpEndUserIds },
            childPanelOwner: { $exists: false },
          },
        ],
      };
    }

    const totalOrders = await Order.countDocuments(orderQuery);
    const totalPages = Math.ceil(totalOrders / limitNum);

    const ordersRaw = await Order.find(orderQuery)
      .populate({ path: "userId", select: "email balance" })
      .populate({ path: "childPanelOwner", select: "email balance" })
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean();

    const orders = ordersRaw.map((order) => {
      // If this order has childPanelOwner stamped, show the CP owner
      // Admin should not deal with CP end-users directly
      const displayUser = order.childPanelOwner
        ? order.childPanelOwner
        : order.userId;

      return {
        _id: order._id,
        orderId: order.orderId,
        customOrderId: order.customOrderId,
        service: order.service,
        link: order.link,
        quantity: order.quantity,
        quantityDelivered: order.quantityDelivered || 0,
        charge: order.charge,
        status: order.status,
        providerStatus: order.providerStatus,
        createdAt: order.createdAt,
        isChildPanelOrder: !!order.childPanelOwner,
        user: displayUser
          ? {
              _id: displayUser._id,
              email: displayUser.email,
              username: displayUser.email?.split("@")[0] || "",
              balance: displayUser.balance || 0,
            }
          : { _id: null, email: "Unknown", username: "", balance: 0 },
      };
    });

    if (req.user?._id) {
      await logAdminAction({
        adminId: req.user._id,
        adminEmail: req.user.email,
        action: "VIEW_ORDERS",
        description: "Viewed all orders",
        targetType: "order",
        ipAddress: req.ip,
      });
    }

    res.json({ orders, totalPages });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch orders" });
  }
};

/* ======================================================
   UPDATE ORDER STATUS (Safe Manual Control)
====================================================== */
export const updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;

    const allowedStatuses = [
      "pending",
      "processing",
      "partial",
      "completed",
      "failed",
      "cancelled",
      "refunded",
    ];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        message: "Invalid status",
      });
    }

    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        message: "Order not found",
      });
    }

    if (order.status === "refunded") {
      return res.status(400).json({
        message: "Cannot modify a refunded order",
      });
    }

    if (
      order.status === "completed" &&
      status !== "completed"
    ) {
      return res.status(400).json({
        message: "Completed order cannot be modified",
      });
    }

    // ✅ REMOVED OLD BLOCK
    // partial now allowed even with 0 delivered

    order.status = status;

    // auto-complete quantity
    if (status === "completed") {
      order.quantityDelivered = order.quantity;
    }

    await order.save();

    /* =========================================
       AUTO REFUND WHEN FAILED
    ========================================= */
    let refundData = null;

    if (status === "failed") {
      refundData = await processRefund({
        order,
        refundType: "full",
      });
    }

    /* =========================================
       AUTO REFUND WHEN PARTIAL
    ========================================= */
    if (status === "partial") {
      refundData = await processRefund({
        order,
        refundType: "partial",
      });
    }

    // credit reseller
    if (order.status === "completed") {
      await creditResellerCommission(order);
    }

    const io = req.app.get("io");

    if (io) {
      io.emit("order:update", {
        _id: order._id,
        status: order.status,
        quantityDelivered: order.quantityDelivered,
      });

      // wallet realtime update
      if (refundData) {
        io.emit("wallet:update", {
          userId: refundData.walletUserId,
          balance: refundData.walletBalance,
        });
      }
    }

    res.json({
      message: "Status updated",
      order,
      refundAmount: refundData?.refundAmount || 0,
    });
  } catch (error) {
    console.error("Update Status Error:", error);

    res.status(500).json({
      message: "Failed to update status",
    });
  }
};

/* ======================================================
   UPDATE ORDER PROGRESS (ADMIN MANUAL)
====================================================== */
export const updateOrderProgress = async (req, res) => {
  try {
    const { quantityDelivered } = req.body;

    const order = await Order.findById(req.params.id);

    if (!order)
      return res.status(404).json({
        message: "Order not found",
      });

    if (order.status === "refunded") {
      return res.status(400).json({
        message: "Cannot edit refunded order",
      });
    }

    if (order.status === "completed") {
      return res.status(400).json({
        message: "Completed order cannot be edited",
      });
    }

    const delivered = Number(quantityDelivered);

    if (isNaN(delivered) || delivered < 0) {
      return res.status(400).json({
        message: "Invalid quantity",
      });
    }

    if (delivered > order.quantity) {
      return res.status(400).json({
        message: "Delivered cannot exceed total quantity",
      });
    }

    if (delivered < order.quantityDelivered) {
      return res.status(400).json({
        message: "Cannot reduce delivered quantity",
      });
    }

    order.quantityDelivered = delivered;

    if (delivered === order.quantity) {
      order.status = "completed";
    } else if (delivered > 0) {
      order.status = "processing";
    }

    await order.save();

    // 💰 CREDIT RESELLER (SAFE)
    if (order.status === "completed") {
      await creditResellerCommission(order);
    }

    const io = req.app.get("io");

    if (io) {
      io.emit("order:update", {
        _id: order._id,
        status: order.status,
        quantityDelivered: order.quantityDelivered,
      });
    }

    res.json({
      message: "Progress updated",
      order,
    });
  } catch (error) {
    console.error("Update Progress Error:", error);

    res.status(500).json({
      message: "Failed to update progress",
    });
  }
};

/* ======================================================
   REFUND ORDER (FULL / PARTIAL / CUSTOM)
====================================================== */
export const refundOrder = async (req, res) => {
  try {
    const { type, customAmount } = req.body;

    const order = await Order.findById(req.params.id)
      .populate("userId");

    if (!order) {
      return res.status(404).json({
        message: "Order not found",
      });
    }

    const refundData = await processRefund({
      order,
      refundType: type,
      customAmount,
    });

    if (!refundData) {
      return res.status(400).json({
        message: "Refund failed or already processed",
      });
    }

    order.status = "refunded";

    await order.save();

    const io = req.app.get("io");

    if (io) {
      io.emit("order:update", {
        _id: order._id,
        status: "refunded",
        quantityDelivered: order.quantityDelivered,
      });

      io.emit("wallet:update", {
        userId: refundData.walletUserId,
        balance: refundData.walletBalance,
      });
    }

    res.json({
      message: "Refund successful",
      refundAmount: refundData.refundAmount,
    });
  } catch (error) {
    console.error("Refund Error:", error);

    res.status(500).json({
      message: "Refund failed",
    });
  }
};

/* =====================================================
   GET GLOBAL ORDER STATS
===================================================== */
export const getOrderStats = async (req, res) => {
  try {
    const {
      search,
      status,
      fromDate,
      toDate,
    } = req.query;

    const match = {};

    if (status) match.status = status;

    if (fromDate || toDate) {
      match.createdAt = {};

      if (fromDate) {
        match.createdAt.$gte = new Date(fromDate);
      }

      if (toDate) {
        match.createdAt.$lte = new Date(toDate);
      }
    }

    if (search) {
      const regex = new RegExp(search, "i");

      const users = await User.find({
        email: regex,
      }).select("_id");

      const userIds = users.map((u) => u._id);

      match.$or = [
        { orderId: regex },
        { customOrderId: regex },
        { service: regex },
        { provider: regex },
        { link: regex },
        { userId: { $in: userIds } },
        ...(!isNaN(search)
          ? [{ rate: Number(search) }]
          : []),
      ];
    }

    const stats = await Order.aggregate([
      { $match: match },

      {
        $facet: {
          total: [{ $count: "count" }],

          pending: [
            { $match: { status: "pending" } },
            { $count: "count" },
          ],

          processing: [
            { $match: { status: "processing" } },
            { $count: "count" },
          ],

          completed: [
            { $match: { status: "completed" } },
            { $count: "count" },
          ],

          partial: [
            { $match: { status: "partial" } },
            { $count: "count" },
          ],

          failed: [
            { $match: { status: "failed" } },
            { $count: "count" },
          ],
        },
      },
    ]);

    const result = stats[0];

    res.json({
      total: result.total[0]?.count || 0,
      pending: result.pending[0]?.count || 0,
      processing: result.processing[0]?.count || 0,
      completed: result.completed[0]?.count || 0,
      partial: result.partial[0]?.count || 0,
      failed: result.failed[0]?.count || 0,
    });
  } catch (err) {
    console.error("Stats error:", err);

    res.status(500).json({
      message: "Failed to fetch stats",
    });
  }
};
