// controllers/childPanelAdminController.js

import User from "../models/User.js";
import Order from "../models/Order.js";
import Settings from "../models/Settings.js";
import mongoose from "mongoose";

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);
const formatNumber = (num) => Number(Number(num || 0).toFixed(4));

/* ================================================
   GET ALL CHILD PANELS
================================================ */

export const getAllChildPanels = async (req, res) => {
  try {
    const page  = Number(req.query.page)  || 1;
    const limit = Number(req.query.limit) || 20;
    const skip  = (page - 1) * limit;

    const childPanels = await User.aggregate([
      { $match: { isChildPanel: true } },

      {
        $lookup: {
          from: "users",
          let:  { cpId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$childPanelOwner", "$$cpId"] },
                    { $eq: ["$isReseller", true] },
                  ],
                },
              },
            },
            { $count: "count" },
          ],
          as: "resellersCount",
        },
      },

      {
        $lookup: {
          from: "users",
          let:  { cpId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$childPanelOwner", "$$cpId"] },
                    { $ne:  ["$isReseller", true] },
                    { $ne:  ["$isAdmin",    true] },
                  ],
                },
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
          let:  { cpId: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$childPanelOwner", "$$cpId"] } } },
            { $count: "count" },
          ],
          as: "ordersCount",
        },
      },

      {
        $project: {
          email:                   1,
          phone:                   1,
          childPanelBrandName:     1,
          childPanelSlug:          1,
          childPanelDomain:        1,
          childPanelIsActive:      1,
          childPanelSuspendReason: 1,
          childPanelActivatedAt:   1,
          childPanelWallet:        1,
          childPanelBillingMode:   1,
          childPanelMonthlyFee:    1,
          childPanelPerOrderFee:   1,
          childPanelLastBilledAt:  1,
          childPanelPaymentMode:   1,
          childPanelServiceMode:   1,
          createdAt:               1,
          resellersCount: { $ifNull: [{ $arrayElemAt: ["$resellersCount.count", 0] }, 0] },
          usersCount:     { $ifNull: [{ $arrayElemAt: ["$usersCount.count",     0] }, 0] },
          ordersCount:    { $ifNull: [{ $arrayElemAt: ["$ordersCount.count",    0] }, 0] },
        },
      },

      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
    ]);

    const total = await User.countDocuments({ isChildPanel: true });

    res.json({
      success: true,
      data: childPanels,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to fetch child panels" });
  }
};

/* ================================================
   GET CHILD PANEL DETAILS  (resellers + users + orders)
================================================ */

export const getChildPanelDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const resellerPage = Number(req.query.resellerPage) || 1;
    const userPage     = Number(req.query.userPage)     || 1;
    const orderPage    = Number(req.query.orderPage)    || 1;
    const limit        = Number(req.query.limit)        || 20;

    if (!isValidId(id)) {
      return res.status(400).json({ success: false, message: "Invalid ID" });
    }

    const cp = await User.findById(id).lean();

    if (!cp || !cp.isChildPanel) {
      return res.status(404).json({ success: false, message: "Child panel not found" });
    }

    const [resellers, users, orders, totalResellers, totalUsers, totalOrders] =
      await Promise.all([
        User.find({ isReseller: true, childPanelOwner: id })
          .select("email phone brandName resellerDomain isSuspended createdAt")
          .sort({ createdAt: -1 })
          .skip((resellerPage - 1) * limit)
          .limit(limit)
          .lean(),

        // Regular users (non-reseller, non-admin) on this child panel
        User.find({
          childPanelOwner: id,
          isReseller: { $ne: true },
          isAdmin:    { $ne: true },
          isChildPanel: { $ne: true },
        })
          .select("email phone balance isBlocked isFrozen lastSeen createdAt")
          .sort({ createdAt: -1 })
          .skip((userPage - 1) * limit)
          .limit(limit)
          .lean(),

        Order.find({ childPanelOwner: id })
          .sort({ createdAt: -1 })
          .skip((orderPage - 1) * limit)
          .limit(limit)
          .lean(),

        User.countDocuments({ isReseller: true,   childPanelOwner: id }),
        User.countDocuments({
          childPanelOwner: id,
          isReseller: { $ne: true },
          isAdmin:    { $ne: true },
          isChildPanel: { $ne: true },
        }),
        Order.countDocuments({ childPanelOwner: id }),
      ]);

    // Revenue / earnings stats
    const allOrders = await Order.find({ childPanelOwner: id }).lean();
    let totalRevenue  = 0;
    let totalEarnings = 0;
    for (const o of allOrders) {
      if (o.status !== "failed" && o.status !== "refunded") {
        totalRevenue += Number(o.charge || 0);
      }
      if (o.childPanelEarningsCredited) {
        totalEarnings += Number(o.childPanelCommission || 0);
      }
    }

    res.json({
      success: true,
      data: {
        childPanel: cp,
        stats: {
          childPanelWallet: formatNumber(cp.childPanelWallet),
          totalOrders:      allOrders.length,
          totalRevenue:     formatNumber(totalRevenue),
          totalEarnings:    formatNumber(totalEarnings),
          totalResellers,
          totalUsers,
        },
        resellers,
        users,
        orders,
        pagination: {
          limit,
          resellerPage,
          userPage,
          orderPage,
          totalResellers,
          totalUsers,
          totalOrders,
          resellerPages: Math.ceil(totalResellers / limit),
          userPages:     Math.ceil(totalUsers / limit),
          orderPages:    Math.ceil(totalOrders / limit),
        },
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to fetch details" });
  }
};

/* ================================================
   TOGGLE CHILD PANEL STATUS  (suspend / activate)
   Accepts optional { reason } in body for suspend message
================================================ */

export const toggleChildPanelStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body || {};

    if (!isValidId(id)) {
      return res.status(400).json({ success: false, message: "Invalid ID" });
    }

    const cp = await User.findById(id);
    if (!cp || !cp.isChildPanel) {
      return res.status(404).json({ success: false, message: "Child panel not found" });
    }

    cp.childPanelIsActive = !cp.childPanelIsActive;

    // Store suspension reason so the frontend can show it
    if (!cp.childPanelIsActive) {
      cp.childPanelSuspendReason = (reason && reason.trim()) || "Your panel has been suspended.";
    } else {
      cp.childPanelSuspendReason = null;
    }

    await cp.save();

    res.json({
      success: true,
      message: `Child panel ${cp.childPanelIsActive ? "activated" : "suspended"}`,
      isActive: cp.childPanelIsActive,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to update status" });
  }
};

/* ================================================
   UPDATE CHILD PANEL BILLING
   Admin manually overrides fees for a specific child panel
================================================ */

export const updateChildPanelBilling = async (req, res) => {
  try {
    const { id } = req.params;
    const { billingMode, monthlyFee, perOrderFee } = req.body;

    if (!isValidId(id)) {
      return res.status(400).json({ success: false, message: "Invalid ID" });
    }

    const cp = await User.findById(id);
    if (!cp || !cp.isChildPanel) {
      return res.status(404).json({ success: false, message: "Child panel not found" });
    }

    if (billingMode)           cp.childPanelBillingMode  = billingMode;
    if (monthlyFee  !== undefined) cp.childPanelMonthlyFee  = Number(monthlyFee);
    if (perOrderFee !== undefined) cp.childPanelPerOrderFee = Number(perOrderFee);

    await cp.save();
    res.json({ success: true, message: "Billing updated" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to update billing" });
  }
};

/* ================================================
   UPDATE CHILD PANEL COMMISSION RATE
================================================ */

export const updateChildPanelCommission = async (req, res) => {
  try {
    const { id } = req.params;
    const { commission } = req.body;

    if (!isValidId(id)) {
      return res.status(400).json({ success: false, message: "Invalid ID" });
    }

    const rate = Number(commission);
    if (isNaN(rate) || rate < 0 || rate > 100) {
      return res.status(400).json({ message: "Commission must be between 0 and 100" });
    }

    const cp = await User.findById(id);
    if (!cp || !cp.isChildPanel) {
      return res.status(404).json({ success: false, message: "Child panel not found" });
    }

    cp.childPanelCommissionRate = rate;
    await cp.save();

    res.json({ success: true, message: "Commission updated" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to update commission" });
  }
};

/* ================================================
   GET GLOBAL CHILD PANEL SETTINGS
   Returns fees + tiered billing for admin settings UI
================================================ */

export const getChildPanelSettings = async (req, res) => {
  try {
    const settings = await Settings.findOne().lean();
    if (!settings) {
      return res.status(404).json({ message: "Settings not found" });
    }

    res.json({
      success: true,
      data: {
        activationFee:      settings.childPanelActivationFee      ?? 100,
        billingMode:        settings.childPanelBillingMode         ?? "monthly",
        monthlyFee:         settings.childPanelMonthlyFee          ?? 20,
        perOrderFee:        settings.childPanelPerOrderFee         ?? 0,
        withdrawMin:        settings.childPanelWithdrawMin         ?? 10,
        minDeposit:         settings.childPanelMinDeposit          ?? 5,
        monthlyTiers:       settings.childPanelMonthlyTiers        ?? [],
        offerActive:        settings.childPanelOfferActive         ?? false,
        offerLabel:         settings.childPanelOfferLabel          ?? "Special Offer",
        offerActivationFee: settings.childPanelOfferActivationFee  ?? 2,
        offerMonthlyFee:    settings.childPanelOfferMonthlyFee     ?? 0,
        offerExpiresAt:     settings.childPanelOfferExpiresAt      ?? null,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to fetch settings" });
  }
};

/* ================================================
   UPDATE GLOBAL OFFER / PROMO
================================================ */

export const updateChildPanelOffer = async (req, res) => {
  try {
    const { offerActive, offerLabel, offerActivationFee, offerMonthlyFee, offerExpiresAt } =
      req.body;

    const settings = await Settings.findOne();
    if (!settings) return res.status(404).json({ message: "Settings not found" });

    if (offerActive         !== undefined) settings.childPanelOfferActive        = offerActive;
    if (offerLabel)                        settings.childPanelOfferLabel          = offerLabel;
    if (offerActivationFee  !== undefined) settings.childPanelOfferActivationFee  = Number(offerActivationFee);
    if (offerMonthlyFee     !== undefined) settings.childPanelOfferMonthlyFee     = Number(offerMonthlyFee);
    if (offerExpiresAt      !== undefined) {
      settings.childPanelOfferExpiresAt = offerExpiresAt ? new Date(offerExpiresAt) : null;
    }

    await settings.save();
    res.json({ success: true, message: "Offer updated" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to update offer" });
  }
};

/* ================================================
   UPDATE GLOBAL DEFAULT FEES
   Also saves tiered monthly billing tiers
================================================ */

export const updateChildPanelDefaultFees = async (req, res) => {
  try {
    const {
      activationFee,
      billingMode,
      monthlyFee,
      perOrderFee,
      withdrawMin,
      minDeposit,
      monthlyTiers,   // array of { minOrders, maxOrders, fee }
    } = req.body;

    const settings = await Settings.findOne();
    if (!settings) return res.status(404).json({ message: "Settings not found" });

    if (activationFee !== undefined) settings.childPanelActivationFee = Number(activationFee);
    if (billingMode)                 settings.childPanelBillingMode   = billingMode;
    if (monthlyFee    !== undefined) settings.childPanelMonthlyFee    = Number(monthlyFee);
    if (perOrderFee   !== undefined) settings.childPanelPerOrderFee   = Number(perOrderFee);
    if (withdrawMin   !== undefined) settings.childPanelWithdrawMin   = Number(withdrawMin);
    if (minDeposit    !== undefined) settings.childPanelMinDeposit    = Number(minDeposit);

    // Validate and save tiered billing
    if (Array.isArray(monthlyTiers)) {
      for (const t of monthlyTiers) {
        if (typeof t.minOrders !== "number" || t.minOrders < 0) {
          return res.status(400).json({ message: "Each tier must have a valid minOrders >= 0" });
        }
        if (t.maxOrders !== null && typeof t.maxOrders === "number" && t.maxOrders < t.minOrders) {
          return res.status(400).json({ message: "maxOrders must be >= minOrders" });
        }
        if (typeof t.fee !== "number" || t.fee < 0) {
          return res.status(400).json({ message: "Each tier must have a valid fee >= 0" });
        }
      }
      settings.childPanelMonthlyTiers = monthlyTiers;
    }

    await settings.save();
    res.json({ success: true, message: "Default fees updated" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to update fees" });
  }
};

/* ================================================
   DEACTIVATE / DELETE CHILD PANEL
================================================ */

export const deactivateChildPanel = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({ success: false, message: "Invalid ID" });
    }

    const cp = await User.findById(id);
    if (!cp || !cp.isChildPanel) {
      return res.status(404).json({ success: false, message: "Child panel not found" });
    }

    await User.updateMany({ childPanelOwner: cp._id }, { $set: { childPanelOwner: null } });

    cp.isChildPanel          = false;
    cp.childPanelIsActive    = false;
    cp.childPanelDomain      = null;
    cp.childPanelSlug        = null;
    cp.childPanelBrandName   = null;
    cp.childPanelActivatedAt = null;
    cp.childPanelWallet      = 0;
    cp.childPanelOwner       = null;

    await cp.save();
    res.json({ success: true, message: "Child panel deactivated" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to deactivate" });
  }
};
