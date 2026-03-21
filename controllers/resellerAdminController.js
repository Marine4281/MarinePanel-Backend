//controllers/resellerAdminController.js
import User from "../models/User.js";
import Order from "../models/Order.js";
import Wallet from "../models/Wallet.js";
import Settings from "../models/Settings.js";
import mongoose from "mongoose";

/* =========================================================
   GET ALL RESELLERS
========================================================= */
export const getAllResellers = async (req, res) => {
  try {
    const resellers = await User.find({ isReseller: true })
      .select("email phone resellerWallet createdAt isSuspended")
      .lean();

    const data = await Promise.all(
      resellers.map(async (r) => {
        const usersCount = await User.countDocuments({
          resellerOwner: r._id,
        });

        const ordersCount = await Order.countDocuments({
          resellerOwner: r._id,
        });

        return {
          ...r,
          usersCount,
          ordersCount,
        };
      })
    );

    res.json(data);
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

    const reseller = await User.findById(id).lean();
    if (!reseller)
      return res.status(404).json({ message: "Reseller not found" });

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

      totalRevenue += charge;
      resellerEarnings += resellerCommission;

      if (order.isFreeOrder) {
        freeOrders++;
        continue;
      }

      // provider cost approximation
      const providerCost = charge - resellerCommission;
      providerCostTotal += providerCost;

      // admin profit
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

    const reseller = await User.findById(id);
    if (!reseller)
      return res.status(404).json({ message: "Reseller not found" });

    reseller.resellerCommissionRate = Number(commission || 0);
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

    const reseller = await User.findById(id);
    if (!reseller)
      return res.status(404).json({ message: "Reseller not found" });

    const newStatus = !reseller.isSuspended;

    reseller.isSuspended = newStatus;
    await reseller.save();

    // update all users under reseller
    await User.updateMany(
      { resellerOwner: reseller._id },
      { isSuspended: newStatus }
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

    const query = { resellerOwner: id };

    if (status) query.status = status;

    if (from && to) {
      query.createdAt = {
        $gte: new Date(from),
        $lte: new Date(to),
      };
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
