// controllers/childPanelAdminController.js

import User from "../models/User.js";
import Order from "../models/Order.js";
import Wallet from "../models/Wallet.js";
import Settings from "../models/Settings.js";
import mongoose from "mongoose";

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);
const formatNumber = (num) => Number(Number(num || 0).toFixed(4));

/* ================================================
   GET ALL CHILD PANELS
================================================ */

export const getAllChildPanels = async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const childPanels = await User.aggregate([
      { $match: { isChildPanel: true } },

      {
        $lookup: {
          from: "users",
          let: { cpId: "$_id" },
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
          from: "orders",
          let: { cpId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$childPanelOwner", "$$cpId"] },
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
          childPanelBrandName: 1,
          childPanelSlug: 1,
          childPanelDomain: 1,
          childPanelIsActive: 1,
          childPanelActivatedAt: 1,
          childPanelWallet: 1,
          childPanelBillingMode: 1,
          childPanelMonthlyFee: 1,
          childPanelPerOrderFee: 1,
          childPanelLastBilledAt: 1,
          childPanelPaymentMode: 1,
          childPanelServiceMode: 1,
          createdAt: 1,
          resellersCount: {
            $ifNull: [{ $arrayElemAt: ["$resellersCount.count", 0] }, 0],
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

    const total = await User.countDocuments({ isChildPanel: true });

    res.json({
      success: true,
      data: childPanels,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to fetch child panels" });
  }
};

/* ================================================
   GET CHILD PANEL DETAILS
================================================ */

export const getChildPanelDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    if (!isValidId(id)) {
      return res.status(400).json({ success: false, message: "Invalid ID" });
    }

    const cp = await User.findById(id).lean();

    if (!cp || !cp.isChildPanel) {
      return res.status(404).json({ success: false, message: "Child panel not found" });
    }

    const [resellers, orders, totalResellers, totalOrders] = await Promise.all([
      User.find({ isReseller: true, childPanelOwner: id })
        .select("email phone brandName resellerDomain isSuspended createdAt")
        .skip(skip)
        .limit(limit)
        .lean(),

      Order.find({ childPanelOwner: id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      User.countDocuments({ isReseller: true, childPanelOwner: id }),
      Order.countDocuments({ childPanelOwner: id }),
    ]);

    // Stats from all orders
    const allOrders = await Order.find({ childPanelOwner: id }).lean();

    let totalRevenue = 0;
    let totalEarnings = 0;

    for (const order of allOrders) {
      if (order.status !== "failed" && order.status !== "refunded") {
        totalRevenue += Number(order.charge || 0);
      }
      if (order.childPanelEarningsCredited) {
        totalEarnings += Number(order.childPanelCommission || 0);
      }
    }

    res.json({
      success: true,
      data: {
        childPanel: cp,
        stats: {
          childPanelWallet: formatNumber(cp.childPanelWallet),
          totalOrders: allOrders.length,
          totalRevenue: formatNumber(totalRevenue),
          totalEarnings: formatNumber(totalEarnings),
          totalResellers,
        },
        resellers,
        orders,
        pagination: {
          page,
          limit,
          totalResellers,
          totalOrders,
          resellerPages: Math.ceil(totalResellers / limit),
          orderPages: Math.ceil(totalOrders / limit),
        },
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to fetch details" });
  }
};

/* ================================================
   TOGGLE CHILD PANEL STATUS
   Admin suspends or activates a child panel
================================================ */

export const toggleChildPanelStatus = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({ success: false, message: "Invalid ID" });
    }

    const cp = await User.findById(id);

    if (!cp || !cp.isChildPanel) {
      return res.status(404).json({ success: false, message: "Child panel not found" });
    }

    cp.childPanelIsActive = !cp.childPanelIsActive;
    await cp.save();

    res.json({
      success: true,
      message: `Child panel ${cp.childPanelIsActive ? "activated" : "suspended"}`,
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

    if (billingMode) cp.childPanelBillingMode = billingMode;
    if (monthlyFee !== undefined) cp.childPanelMonthlyFee = Number(monthlyFee);
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
   Admin sets how much a child panel earns per order
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
      return res.status(400).json({
        message: "Commission must be between 0 and 100",
      });
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
   UPDATE CHILD PANEL OFFER / PROMO (GLOBAL)
   Admin sets the global offer shown on activation page
================================================ */

export const updateChildPanelOffer = async (req, res) => {
  try {
    const {
      offerActive,
      offerLabel,
      offerActivationFee,
      offerMonthlyFee,
      offerExpiresAt,
    } = req.body;

    const settings = await Settings.findOne();
    if (!settings) {
      return res.status(404).json({ message: "Settings not found" });
    }

    if (offerActive !== undefined) settings.childPanelOfferActive = offerActive;
    if (offerLabel) settings.childPanelOfferLabel = offerLabel;
    if (offerActivationFee !== undefined) settings.childPanelOfferActivationFee = Number(offerActivationFee);
    if (offerMonthlyFee !== undefined) settings.childPanelOfferMonthlyFee = Number(offerMonthlyFee);
    if (offerExpiresAt !== undefined) {
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
   UPDATE GLOBAL CHILD PANEL FEES (DEFAULT)
   Admin sets the defaults applied to all new child panels
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
    } = req.body;

    const settings = await Settings.findOne();
    if (!settings) {
      return res.status(404).json({ message: "Settings not found" });
    }

    if (activationFee !== undefined) settings.childPanelActivationFee = Number(activationFee);
    if (billingMode) settings.childPanelBillingMode = billingMode;
    if (monthlyFee !== undefined) settings.childPanelMonthlyFee = Number(monthlyFee);
    if (perOrderFee !== undefined) settings.childPanelPerOrderFee = Number(perOrderFee);
    if (withdrawMin !== undefined) settings.childPanelWithdrawMin = Number(withdrawMin);
    if (minDeposit !== undefined) settings.childPanelMinDeposit = Number(minDeposit);

    await settings.save();

    res.json({ success: true, message: "Default fees updated" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to update fees" });
  }
};

/* ================================================
   DEACTIVATE / DELETE CHILD PANEL
   Removes child panel status — user account stays intact
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

    // Remove all child panel resellers' link to this panel
    await User.updateMany(
      { childPanelOwner: cp._id },
      { $set: { childPanelOwner: null } }
    );

    // Clear child panel fields — user account stays
    cp.isChildPanel = false;
    cp.childPanelIsActive = false;
    cp.childPanelDomain = null;
    cp.childPanelSlug = null;
    cp.childPanelBrandName = null;
    cp.childPanelActivatedAt = null;
    cp.childPanelWallet = 0;
    cp.childPanelOwner = null;

    await cp.save();

    res.json({ success: true, message: "Child panel deactivated" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to deactivate" });
  }
};
