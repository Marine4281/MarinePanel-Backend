// controllers/resellerAdminController.js

import User from "../models/User.js";
import Order from "../models/Order.js";
import Wallet from "../models/Wallet.js";
import mongoose from "mongoose";

/* ========================================================= */
const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

/* =========================================================
   GET ALL RESELLERS (FIXED)
========================================================= */
export const getAllResellers = async (req, res) => {
  try {
    const resellers = await User.aggregate([
      { $match: { isReseller: true } },

      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "resellerOwner",
          as: "users",
        },
      },
      {
        $lookup: {
          from: "orders",
          localField: "_id",
          foreignField: "resellerOwner",
          as: "orders",
        },
      },

      {
        $project: {
          email: 1,
          phone: 1,
          createdAt: 1,
          isSuspended: 1,
          usersCount: { $size: "$users" },
          ordersCount: { $size: "$orders" },
        },
      },
    ]);

    res.json(resellers);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to fetch resellers" });
  }
};

/* =========================================================
   GET RESELLER DETAILS (FULLY FIXED)
========================================================= */
export const getResellerDetails = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid reseller ID" });
    }

    const reseller = await User.findById(id).lean();
    if (!reseller || !reseller.isReseller) {
      return res.status(404).json({ message: "Reseller not found" });
    }

    const [users, orders, wallet] = await Promise.all([
      User.find({ resellerOwner: id })
        .select("email phone balance createdAt isSuspended")
        .lean(),

      Order.find({ resellerOwner: id }).lean(),

      Wallet.findOne({ user: id }).lean(),
    ]);

    /* ================= STATS ================= */

    let totalOrders = orders.length;
    let totalRevenue = 0;
    let resellerEarnings = 0;
    let freeOrders = 0;

    for (const order of orders) {
      const charge = Number(order.charge || 0);

      if (order.status !== "failed" && order.status !== "refunded") {
        totalRevenue += charge;
      }

      // ✅ ONLY COUNT CREDITED EARNINGS
      if (order.earningsCredited) {
        resellerEarnings += Number(order.resellerCommission || 0);
      }

      if (order.isFreeOrder) freeOrders++;
    }

    res.json({
      reseller,
      stats: {
        wallet: wallet?.balance || 0, // ✅ FIXED
        totalOrders,
        totalRevenue,
        resellerEarnings,
        freeOrders,
      },
      users,
      orders,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to fetch reseller details" });
  }
};

/* =========================================================
   UPDATE COMMISSION
========================================================= */
export const updateResellerCommission = async (req, res) => {
  try {
    const { id } = req.params;
    const { commission } = req.body;

    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid reseller ID" });
    }

    const rate = Number(commission);

    if (isNaN(rate) || rate < 0 || rate > 100) {
      return res.status(400).json({
        message: "Commission must be between 0 and 100",
      });
    }

    const reseller = await User.findById(id);

    if (!reseller || !reseller.isReseller) {
      return res.status(404).json({ message: "Reseller not found" });
    }

    reseller.resellerCommissionRate = rate;
    await reseller.save();

    res.json({ message: "Commission updated" });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to update commission" });
  }
};

/* =========================================================
   TOGGLE STATUS
========================================================= */
export const toggleResellerStatus = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid reseller ID" });
    }

    const reseller = await User.findById(id);

    if (!reseller || !reseller.isReseller) {
      return res.status(404).json({ message: "Reseller not found" });
    }

    const newStatus = !reseller.isSuspended;

    reseller.isSuspended = newStatus;
    await reseller.save();

    await User.updateMany(
      { resellerOwner: reseller._id },
      { $set: { isSuspended: newStatus } }
    );

    res.json({
      message: `Reseller ${newStatus ? "suspended" : "activated"}`,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to update status" });
  }
};

/* =========================================================
   USERS
========================================================= */
export const getResellerUsers = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid reseller ID" });
    }

    const users = await User.find({ resellerOwner: id })
      .select("email phone balance createdAt isSuspended")
      .lean();

    res.json(users);

  } catch (error) {
    res.status(500).json({ message: "Failed to fetch users" });
  }
};

/* =========================================================
   ORDERS
========================================================= */
export const getResellerOrders = async (req, res) => {
  try {
    const { id } = req.params;
    const { from, to, status } = req.query;

    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid reseller ID" });
    }

    const query = { resellerOwner: id };

    if (status) query.status = status;

    if (from || to) {
      query.createdAt = {};
      if (from) query.createdAt.$gte = new Date(from);
      if (to) query.createdAt.$lte = new Date(to);
    }

    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .lean();

    res.json(orders);

  } catch (error) {
    res.status(500).json({ message: "Failed to fetch orders" });
  }
};
