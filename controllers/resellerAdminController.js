// controllers/resellerAdminController.js

import User from "../models/User.js";
import Order from "../models/Order.js";
import Wallet from "../models/Wallet.js";
import mongoose from "mongoose";

/* ========================================================= */
const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

/* ========================================================= */
const formatNumber = (num) => Number(Number(num || 0).toFixed(4));

/* =========================================================
   GET ALL RESELLERS (OPTIMIZED + PAGINATED)
========================================================= */
export const getAllResellers = async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const resellers = await User.aggregate([
      { $match: { isReseller: true } },

      {
        $lookup: {
          from: "users",
          let: { resellerId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$resellerOwner", "$$resellerId"] },
              },
            },
            { $count: "count" },
          ],
          as: "usersCount",
        },
      },
      {
        $lookup: {
          from: "orders",
          let: { resellerId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$resellerOwner", "$$resellerId"] },
              },
            },
            { $count: "count" },
          ],
          as: "ordersCount",
        },
      },

      {
        $project: {
          email: 1,
          phone: 1,
          createdAt: 1,
          isSuspended: 1,
          usersCount: {
            $ifNull: [{ $arrayElemAt: ["$usersCount.count", 0] }, 0],
          },
          ordersCount: {
            $ifNull: [{ $arrayElemAt: ["$ordersCount.count", 0] }, 0],
          },
        },
      },

      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
    ]);

    const total = await User.countDocuments({ isReseller: true });

    res.json({
      success: true,
      data: resellers,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to fetch resellers" });
  }
};

/* =========================================================
   GET RESELLER DETAILS (PAGINATED + SAFE)
========================================================= */
export const getResellerDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    if (!isValidId(id)) {
      return res.status(400).json({ success: false, message: "Invalid reseller ID" });
    }

    const reseller = await User.findById(id).lean();

    if (!reseller || !reseller.isReseller) {
      return res.status(404).json({ success: false, message: "Reseller not found" });
    }

    const [users, orders, wallet, totalUsers, totalOrders] = await Promise.all([
      User.find({ resellerOwner: id })
        .select("email phone balance createdAt isSuspended")
        .skip(skip)
        .limit(limit)
        .lean(),

      Order.find({ resellerOwner: id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      Wallet.findOne({ user: id }).lean(),

      User.countDocuments({ resellerOwner: id }),
      Order.countDocuments({ resellerOwner: id }),
    ]);

    /* ================= STATS ================= */
    const allOrders = await Order.find({ resellerOwner: id }).lean();

    let totalRevenue = 0;
    let resellerEarnings = 0;
    let freeOrders = 0;

    for (const order of allOrders) {
      const charge = Number(order.charge || 0);

      if (order.status !== "failed" && order.status !== "refunded") {
        totalRevenue += charge;
      }

      if (order.earningsCredited) {
        resellerEarnings += Number(order.resellerCommission || 0);
      }

      if (order.isFreeOrder) freeOrders++;
    }

    res.json({
      success: true,
      data: {
        reseller,
        stats: {
          wallet: formatNumber(wallet?.balance),
          totalOrders: allOrders.length,
          totalRevenue: formatNumber(totalRevenue),
          resellerEarnings: formatNumber(resellerEarnings),
          freeOrders,
        },
        users,
        orders,
        pagination: {
          page,
          limit,
          totalUsers,
          totalOrders,
          userPages: Math.ceil(totalUsers / limit),
          orderPages: Math.ceil(totalOrders / limit),
        },
      },
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to fetch reseller details" });
  }
};

/* =========================================================
   UPDATE COMMISSION (SAFE)
========================================================= */
export const updateResellerCommission = async (req, res) => {
  try {
    const { id } = req.params;
    const { commission } = req.body;

    if (!isValidId(id)) {
      return res.status(400).json({ success: false, message: "Invalid reseller ID" });
    }

    const rate = Number(commission);

    if (isNaN(rate) || rate < 0 || rate > 100) {
      return res.status(400).json({
        success: false,
        message: "Commission must be between 0 and 100",
      });
    }

    const reseller = await User.findById(id);

    if (!reseller || !reseller.isReseller) {
      return res.status(404).json({ success: false, message: "Reseller not found" });
    }

    reseller.resellerCommissionRate = rate;
    reseller.commissionUpdatedAt = new Date();

    await reseller.save();

    res.json({
      success: true,
      message: "Commission updated",
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to update commission" });
  }
};

/* =========================================================
   TOGGLE STATUS (SAFE)
========================================================= */
export const toggleResellerStatus = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({ success: false, message: "Invalid reseller ID" });
    }

    const reseller = await User.findById(id);

    if (!reseller || !reseller.isReseller) {
      return res.status(404).json({ success: false, message: "Reseller not found" });
    }

    const newStatus = !reseller.isSuspended;

    reseller.isSuspended = newStatus;
    await reseller.save();

    // ONLY suspend children (never auto-unsuspend)
    if (newStatus) {
      await User.updateMany(
        { resellerOwner: reseller._id, isSuspended: false },
        { $set: { isSuspended: true } }
      );
    }

    res.json({
      success: true,
      message: `Reseller ${newStatus ? "suspended" : "activated"}`,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to update status" });
  }
};

/* =========================================================
   USERS (PAGINATED)
========================================================= */
export const getResellerUsers = async (req, res) => {
  try {
    const { id } = req.params;

    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    if (!isValidId(id)) {
      return res.status(400).json({ success: false, message: "Invalid reseller ID" });
    }

    const [users, total] = await Promise.all([
      User.find({ resellerOwner: id })
        .select("email phone balance createdAt isSuspended")
        .skip(skip)
        .limit(limit)
        .lean(),

      User.countDocuments({ resellerOwner: id }),
    ]);

    res.json({
      success: true,
      data: users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });

  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch users" });
  }
};

/* =========================================================
   ORDERS (PAGINATED + FILTERED)
========================================================= */
export const getResellerOrders = async (req, res) => {
  try {
    const { id } = req.params;
    const { from, to, status } = req.query;

    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    if (!isValidId(id)) {
      return res.status(400).json({ success: false, message: "Invalid reseller ID" });
    }

    const query = { resellerOwner: id };

    if (status) query.status = status;

    if (from || to) {
      query.createdAt = {};

      if (from) query.createdAt.$gte = new Date(from);

      if (to) {
        const end = new Date(to);
        end.setHours(23, 59, 59, 999);
        query.createdAt.$lte = end;
      }
    }

    const [orders, total] = await Promise.all([
      Order.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      Order.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: orders,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });

  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch orders" });
  }
};
