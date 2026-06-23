// controllers/cpOwnerResellerController.js
//
// Child panel owner managing resellers within their panel.
// Every query is scoped to childPanelOwner: req.user._id
// so it is impossible to read or modify resellers from another panel.
// Mirrors resellerAdminController.js — same operations, different scope.

import User from "../models/User.js";
import Order from "../models/Order.js";
import Wallet from "../models/Wallet.js";
import mongoose from "mongoose";
import logCpAdminAction from "../utils/logCpAdminAction.js";
import ResellerActivationEvent from "../models/ResellerActivationEvent.js";

// ======================= HELPERS =======================

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);
const formatNumber = (num) => Number(Number(num || 0).toFixed(4));

const calculateBalance = (transactions = []) =>
  transactions
    .filter((t) => t.status === "Completed")
    .reduce((acc, t) => acc + (Number(t.amount) || 0), 0);

// ======================= GET ALL RESELLERS =======================
// Paginated list of resellers scoped to this child panel

export const getCPResellers = async (req, res) => {
  try {
    const page   = Number(req.query.page)  || 1;
    const limit  = Number(req.query.limit) || 20;
    const skip   = (page - 1) * limit;
    const search = req.query.search?.trim();
    const status = req.query.status; // "active" | "suspended"

    // Build the match filter
    const matchFilter = {
      isReseller: true,
      childPanelOwner: req.user._id,
    };

    if (search) {
      matchFilter.$or = [
        { email: { $regex: search, $options: "i" } },
        { brandName: { $regex: search, $options: "i" } },
      ];
    }

    if (status === "active")    matchFilter.isSuspended = false;
    if (status === "suspended") matchFilter.isSuspended = true;

    const resellers = await User.aggregate([
      { $match: matchFilter },
      {
        $lookup: {
          from: "users",
          let: { resellerId: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$resellerOwner", "$$resellerId"] } } },
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
            { $match: { $expr: { $eq: ["$resellerOwner", "$$resellerId"] } } },
            { $count: "count" },
          ],
          as: "ordersCount",
        },
      },
      {
        $project: {
          email: 1,
          phone: 1,
          brandName: 1,
          brandSlug: 1,
          resellerDomain: 1,
          resellerCommissionRate: 1,
          resellerWallet: 1,
          isSuspended: 1,
          createdAt: 1,
          usersCount: { $ifNull: [{ $arrayElemAt: ["$usersCount.count", 0] }, 0] },
          ordersCount: { $ifNull: [{ $arrayElemAt: ["$ordersCount.count", 0] }, 0] },
        },
      },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
    ]);

    const total = await User.countDocuments(matchFilter);

    res.json({
      success: true,
      data: resellers,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("CP GET ALL RESELLERS ERROR:", error);
    res.status(500).json({ success: false, message: "Failed to fetch resellers" });
  }
};

// ======================= GET RESELLER DETAILS =======================
// Full stats + paginated users and orders — scoped to this child panel

export const getCPResellerDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    if (!isValidId(id)) {
      return res.status(400).json({ success: false, message: "Invalid ID" });
    }

    // Scope check — reseller must belong to this child panel
    const reseller = await User.findOne({
      _id: id,
      isReseller: true,
      childPanelOwner: req.user._id,
    }).lean();

    if (!reseller) {
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

    // Full stats from all orders
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
          totalUsers,
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
    console.error("CP GET RESELLER DETAILS ERROR:", error);
    res.status(500).json({ success: false, message: "Failed to fetch reseller details" });
  }
};

// ======================= TOGGLE RESELLER STATUS =======================
// Suspend or activate — cascades to reseller's users on suspend

export const toggleCPResellerStatus = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({ success: false, message: "Invalid ID" });
    }

    const reseller = await User.findOne({
      _id: id,
      isReseller: true,
      childPanelOwner: req.user._id,
    });

    if (!reseller) {
      return res.status(404).json({ success: false, message: "Reseller not found" });
    }

    const newStatus = !reseller.isSuspended;
    reseller.isSuspended = newStatus;
    await reseller.save();

    // Only cascade suspend — never auto-unsuspend users
    if (newStatus) {
      await User.updateMany(
        { resellerOwner: reseller._id, isSuspended: false },
        { $set: { isSuspended: true } }
      );
    }
    logCpAdminAction({ adminId: req.user._id, adminEmail: req.user.email,childPanelId: req.user._id, action: "TOGGLE_RESELLER_STATUS", targetType: "Reseller", targetId: reseller._id, description: `Toggled reseller ${reseller._id} status`, ipAddress: req.ip }).catch(() => {});

    res.json({
      success: true,
      message: `Reseller ${newStatus ? "suspended" : "activated"}`,
    });
  } catch (error) {
    console.error("CP TOGGLE RESELLER STATUS ERROR:", error);
    res.status(500).json({ success: false, message: "Failed to update status" });
  }
};

// ======================= UPDATE COMMISSION =======================

export const updateCPResellerCommission = async (req, res) => {
  try {
    const { id } = req.params;
    const { commission } = req.body;

    if (!isValidId(id)) {
      return res.status(400).json({ success: false, message: "Invalid ID" });
    }

    const rate = Number(commission);

    if (isNaN(rate) || rate < 0 || rate > 100) {
      return res.status(400).json({
        success: false,
        message: "Commission must be between 0 and 100",
      });
    }

    const reseller = await User.findOne({
      _id: id,
      isReseller: true,
      childPanelOwner: req.user._id,
    });

    if (!reseller) {
      return res.status(404).json({ success: false, message: "Reseller not found" });
    }

    reseller.resellerCommissionRate = rate;
    reseller.commissionUpdatedAt = new Date();
    await reseller.save();
    logCpAdminAction({ adminId: req.user._id, adminEmail: req.user.email, childPanelId: req.user._id,action: "UPDATE_COMMISSION", targetType: "Reseller", targetId: reseller._id, description: `Updated reseller ${reseller._id} commission`, ipAddress: req.ip }).catch(() => {});

    res.json({ success: true, message: "Commission updated" });
  } catch (error) {
    console.error("CP UPDATE RESELLER COMMISSION ERROR:", error);
    res.status(500).json({ success: false, message: "Failed to update commission" });
  }
};

// ======================= UPDATE RESELLER BALANCE =======================
// Child panel owner can manually adjust a reseller's wallet balance

export const updateCPResellerBalance = async (req, res) => {
  try {
    const { id } = req.params;
    const newBalance = Number(req.body.balance);

    if (!isValidId(id)) {
      return res.status(400).json({ success: false, message: "Invalid ID" });
    }

    if (Number.isNaN(newBalance)) {
      return res.status(400).json({ success: false, message: "Invalid balance" });
    }

    const reseller = await User.findOne({
      _id: id,
      isReseller: true,
      childPanelOwner: req.user._id,
    });

    if (!reseller) {
      return res.status(404).json({ success: false, message: "Reseller not found" });
    }

    let wallet = await Wallet.findOne({ user: reseller._id });

    if (!wallet) {
      wallet = await Wallet.create({
        user: reseller._id,
        transactions: [
          {
            type: "CP Admin Adjustment",
            amount: newBalance,
            status: "Completed",
            note: "Initial balance set by child panel admin",
            createdAt: new Date(),
          },
        ],
      });
    } else {
      const current = calculateBalance(wallet.transactions);
      const diff = newBalance - current;

      if (diff !== 0) {
        wallet.transactions.push({
          type: "CP Admin Adjustment",
          amount: diff,
          status: "Completed",
          note: "Balance updated by child panel admin",
          createdAt: new Date(),
        });
      }
    }

    wallet.balance = calculateBalance(wallet.transactions);
    await wallet.save();

    await User.findByIdAndUpdate(reseller._id, { balance: wallet.balance });
logCpAdminAction({ adminId: req.user._id, adminEmail: req.user.email, childPanelId: req.user._id,action: "UPDATE_BALANCE", targetType: "Reseller", targetId: reseller._id, description: `Updated reseller ${reseller._id} balance`, ipAddress: req.ip }).catch(() => {});

    res.json({ success: true, message: "Balance updated", balance: wallet.balance });
  } catch (error) {
    console.error("CP UPDATE RESELLER BALANCE ERROR:", error);
    res.status(500).json({ success: false, message: "Failed to update balance" });
  }
};

// ======================= GET RESELLER USERS =======================

export const getCPResellerUsers = async (req, res) => {
  try {
    const { id } = req.params;

    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    if (!isValidId(id)) {
      return res.status(400).json({ success: false, message: "Invalid ID" });
    }

    // Verify reseller belongs to this child panel
    const reseller = await User.findOne({
      _id: id,
      isReseller: true,
      childPanelOwner: req.user._id,
    });

    if (!reseller) {
      return res.status(404).json({ success: false, message: "Reseller not found" });
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
    console.error("CP GET RESELLER USERS ERROR:", error);
    res.status(500).json({ success: false, message: "Failed to fetch users" });
  }
};

// ======================= GET RESELLER ORDERS =======================

export const getCPResellerOrders = async (req, res) => {
  try {
    const { id } = req.params;
    const { from, to, status } = req.query;

    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    if (!isValidId(id)) {
      return res.status(400).json({ success: false, message: "Invalid ID" });
    }

    // Verify reseller belongs to this child panel
    const reseller = await User.findOne({
      _id: id,
      isReseller: true,
      childPanelOwner: req.user._id,
    });

    if (!reseller) {
      return res.status(404).json({ success: false, message: "Reseller not found" });
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
    console.error("CP GET RESELLER ORDERS ERROR:", error);
    res.status(500).json({ success: false, message: "Failed to fetch orders" });
  }
};
// ======================= UPDATE RESELLER END-USER BALANCE =======================
// CP owner can adjust the wallet balance of a user who belongs to one of their resellers.
// Double-scoped: reseller must belong to this CP, user must belong to that reseller.

export const updateCPResellerUserBalance = async (req, res) => {
  try {
    const { id: resellerId, userId } = req.params;
    const newBalance = Number(req.body.balance);

    if (!isValidId(resellerId) || !isValidId(userId)) {
      return res.status(400).json({ success: false, message: "Invalid ID" });
    }

    if (Number.isNaN(newBalance)) {
      return res.status(400).json({ success: false, message: "Invalid balance" });
    }

    // Verify reseller belongs to this child panel
    const reseller = await User.findOne({
      _id: resellerId,
      isReseller: true,
      childPanelOwner: req.user._id,
    });
    if (!reseller) {
      return res.status(404).json({ success: false, message: "Reseller not found" });
    }

    // Verify user belongs to that reseller
    const user = await User.findOne({ _id: userId, resellerOwner: resellerId });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    let wallet = await Wallet.findOne({ user: user._id });

    if (!wallet) {
      wallet = await Wallet.create({
        user: user._id,
        transactions: [
          {
            type: "CP Admin Adjustment",
            amount: newBalance,
            status: "Completed",
            note: "Initial balance set by child panel admin",
            createdAt: new Date(),
          },
        ],
      });
    } else {
      const current = calculateBalance(wallet.transactions);
      const diff = newBalance - current;
      if (diff !== 0) {
        wallet.transactions.push({
          type: "CP Admin Adjustment",
          amount: diff,
          status: "Completed",
          note: "Balance updated by child panel admin",
          createdAt: new Date(),
        });
      }
    }

    wallet.balance = calculateBalance(wallet.transactions);
    await wallet.save();
    await User.findByIdAndUpdate(user._id, { balance: wallet.balance });

    logCpAdminAction({
      adminId: req.user._id,
      adminEmail: req.user.email,
      childPanelId: req.user._id,
      action: "UPDATE_RESELLER_USER_BALANCE",
      targetType: "User",
      targetId: user._id,
      description: `Updated balance for reseller end-user ${user.email} (reseller: ${reseller.email}) to $${wallet.balance}`,
      ipAddress: req.ip,
    }).catch(() => {});

    res.json({ success: true, balance: wallet.balance });
  } catch (error) {
    console.error("CP UPDATE RESELLER USER BALANCE ERROR:", error);
    res.status(500).json({ success: false, message: "Failed to update balance" });
  }
};

export const getResellerActivationUnreadCount = async (req, res) => {
  try {
    const count = await ResellerActivationEvent.countDocuments({
      childPanelOwner: req.user._id,
      seen: false,
    });
    res.json({ success: true, count });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch count" });
  }
};

export const getResellerActivationEvents = async (req, res) => {
  try {
    const page  = Number(req.query.page)  || 1;
    const limit = Number(req.query.limit) || 20;
    const skip  = (page - 1) * limit;

    const [events, total] = await Promise.all([
      ResellerActivationEvent.find({ childPanelOwner: req.user._id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ResellerActivationEvent.countDocuments({ childPanelOwner: req.user._id }),
    ]);

    res.json({
      success: true,
      data: events,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch events" });
  }
};

export const markResellerActivationEventsSeen = async (req, res) => {
  try {
    await ResellerActivationEvent.updateMany(
      { childPanelOwner: req.user._id, seen: false },
      { $set: { seen: true } }
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to mark seen" });
  }
};
