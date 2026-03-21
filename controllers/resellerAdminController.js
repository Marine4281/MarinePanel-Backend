// controllers/resellerAdminController.js
import User from "../models/User.js";
import Order from "../models/Order.js";
import mongoose from "mongoose";

/* =========================================================
   HELPER: VALIDATE OBJECT ID
========================================================= */
const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

/* =========================================================
   GET ALL RESELLERS (OPTIMIZED - NO N+1)
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
          resellerWallet: 1,
          createdAt: 1,
          isSuspended: 1,
          usersCount: { $size: "$users" },
          ordersCount: { $size: "$orders" },
        },
      },
    ]);

    res.json(resellers);
  } catch (error) {
    console.error("GET ALL RESELLERS ERROR:", error);
    res.status(500).json({ message: "Failed to fetch resellers" });
  }
};

/* =========================================================
   GET SINGLE RESELLER DETAILS
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

    /* ================= USERS ================= */
    const users = await User.find({ resellerOwner: id })
      .select("email phone balance createdAt isSuspended")
      .lean();

    /* ================= ORDERS ================= */
    const orders = await Order.find({ resellerOwner: id }).lean();

    /* ================= STATS ================= */
    let totalOrders = orders.length;
    let totalRevenue = 0;
    let totalProfit = 0;
    let resellerEarnings = 0;
    let providerCostTotal = 0;
    let freeOrders = 0;

    for (const order of orders) {
      const charge = Number(order.charge || 0);
      const resellerCommission = Number(order.resellerCommission || 0);
      const providerCost = Number(order.providerCost || 0); // ✅ FIXED

      totalRevenue += charge;
      resellerEarnings += resellerCommission;

      if (order.isFreeOrder) {
        freeOrders++;
        continue;
      }

      providerCostTotal += providerCost;

      const adminProfit = charge - providerCost - resellerCommission;
      totalProfit += adminProfit;
    }

    res.json({
      reseller,
      stats: {
        wallet: reseller.resellerWallet || 0,
        totalOrders,
        totalRevenue,
        totalProfit,
        resellerEarnings,
        providerCostTotal,
        freeOrders,
      },
      users,
      orders,
    });
  } catch (error) {
    console.error("GET RESELLER DETAILS ERROR:", error);
    res.status(500).json({ message: "Failed to fetch reseller details" });
  }
};

/* =========================================================
   UPDATE RESELLER COMMISSION
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

    res.json({ message: "Commission updated successfully" });
  } catch (error) {
    console.error("UPDATE COMMISSION ERROR:", error);
    res.status(500).json({ message: "Failed to update commission" });
  }
};

/* =========================================================
   SUSPEND / UNSUSPEND RESELLER + USERS
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
      { $set: { isSuspended: newStatus } } // ✅ safer
    );

    res.json({
      message: `Reseller ${newStatus ? "suspended" : "activated"}`,
    });
  } catch (error) {
    console.error("TOGGLE RESELLER ERROR:", error);
    res.status(500).json({ message: "Failed to update status" });
  }
};

/* =========================================================
   GET RESELLER USERS
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
    console.error("GET RESELLER USERS ERROR:", error);
    res.status(500).json({ message: "Failed to fetch users" });
  }
};

/* =========================================================
   GET RESELLER ORDERS (WITH FILTER)
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
    console.error("GET RESELLER ORDERS ERROR:", error);
    res.status(500).json({ message: "Failed to fetch orders" });
  }
};
