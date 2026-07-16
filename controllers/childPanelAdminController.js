// controllers/childPanelAdminController.js

import User from "../models/User.js";
import Order from "../models/Order.js";
import Settings from "../models/Settings.js";
import mongoose from "mongoose";
import Wallet from "../models/Wallet.js";
import { resolveChildPanelFee, tryReactivateChildPanel } from "../utils/childPanelBilling.js";
import { onCpWalletCredited } from "../utils/onCpWalletCredited.js";

const calculateBalance = (transactions = []) =>
  transactions
    .filter((t) => t.status === "Completed")
    .reduce((acc, t) => acc + (Number(t.amount) || 0), 0);

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
        $lookup: {
          from: "wallets",
          let:  { cpId: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$user", "$$cpId"] } } },
            { $project: { balance: 1 } },
          ],
          as: "walletInfo",
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
          walletBalance: { $ifNull: [{ $arrayElemAt: ["$walletInfo.balance", 0] }, 0] },
          childPanelBillingMode:   1,
          childPanelMonthlyFee:    1,
          childPanelPerOrderFee:   1,
          childPanelLastBilledAt:  1,
          childPanelNextBilledAt:         1,
          childPanelSubscriptionSuspended: 1,
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
    const { billingMode, monthlyFee, perOrderFee, billingIntervalDays, gracePeriodHours, reminderHours, autoDeduct } = req.body;

    if (!isValidId(id)) {
      return res.status(400).json({ success: false, message: "Invalid ID" });
    }

    const cp = await User.findById(id);
    if (!cp || !cp.isChildPanel) {
      return res.status(404).json({ success: false, message: "Child panel not found" });
    }

    if (billingMode)               cp.childPanelBillingMode         = billingMode;
    if (monthlyFee  !== undefined) cp.childPanelMonthlyFee          = Number(monthlyFee);
    if (perOrderFee !== undefined) cp.childPanelPerOrderFee         = Number(perOrderFee);
     if (gracePeriodHours !== undefined) {
  cp.childPanelGracePeriodHours = gracePeriodHours === null ? null : Math.max(0, Number(gracePeriodHours));
}
if (reminderHours !== undefined) {
  cp.childPanelReminderHours = reminderHours === null ? null : Math.max(0, Number(reminderHours));
}
if (autoDeduct !== undefined) {
  cp.childPanelAutoDeduct = autoDeduct === null ? null : Boolean(autoDeduct);
}

    // billingIntervalDays: null means "use global", a number means custom
    if (billingIntervalDays !== undefined) {
      cp.childPanelBillingIntervalDays = billingIntervalDays === null
        ? null
        : Math.max(1, Number(billingIntervalDays));
    }

    // Recalculate next bill date from today using the new interval
    const settings = await Settings.findOne().lean();
    const effectiveInterval = cp.childPanelBillingIntervalDays
      ?? Number(settings?.childPanelBillingIntervalDays ?? 30);
    const now = new Date();
    cp.childPanelLastBilledAt  = now;
    cp.childPanelNextBilledAt  = new Date(now.getTime() + effectiveInterval * 24 * 60 * 60 * 1000);
    cp.childPanelFeeIsCustom   = true;

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
        billingIntervalDays:  settings.childPanelBillingIntervalDays    ?? 30,
        offerActive:        settings.childPanelOfferActive         ?? false,
        offerLabel:         settings.childPanelOfferLabel          ?? "Special Offer",
        offerActivationFee: settings.childPanelOfferActivationFee  ?? 2,
        offerMonthlyFee:    settings.childPanelOfferMonthlyFee     ?? 0,
        offerExpiresAt:     settings.childPanelOfferExpiresAt      ?? null,
        gracePeriodHours:    settings.childPanelGracePeriodHours    ?? 0,
        reminderHours:       settings.childPanelReminderHours       ?? 48,
        autoDeduct:          settings.childPanelAutoDeduct          ?? true,
        platformResellerActivationFee: settings.platformResellerActivationFee ?? 5,
         
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
      billingIntervalDays,
      gracePeriodHours,
      reminderHours,
      autoDeduct,
      platformResellerActivationFee,
       
    } = req.body;

    const settings = await Settings.findOne();
    if (!settings) return res.status(404).json({ message: "Settings not found" });

    if (activationFee !== undefined) settings.childPanelActivationFee = Number(activationFee);
    if (billingMode)                 settings.childPanelBillingMode   = billingMode;
    if (monthlyFee    !== undefined) settings.childPanelMonthlyFee    = Number(monthlyFee);
    if (perOrderFee   !== undefined) settings.childPanelPerOrderFee   = Number(perOrderFee);
    if (withdrawMin   !== undefined) settings.childPanelWithdrawMin   = Number(withdrawMin);
    if (minDeposit    !== undefined) settings.childPanelMinDeposit    = Number(minDeposit);
    if (gracePeriodHours !== undefined) settings.childPanelGracePeriodHours = Math.max(0, Number(gracePeriodHours));
    if (reminderHours    !== undefined) settings.childPanelReminderHours    = Math.max(0, Number(reminderHours));
    if (autoDeduct       !== undefined) settings.childPanelAutoDeduct       = Boolean(autoDeduct);
    if (billingIntervalDays !== undefined) {
  settings.childPanelBillingIntervalDays = Math.max(1, Number(billingIntervalDays));
     }
     if (platformResellerActivationFee !== undefined) {
  settings.platformResellerActivationFee = Math.max(0, Number(platformResellerActivationFee));
     }

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
    cp.childPanelOwner       = null;

    await cp.save();
    res.json({ success: true, message: "Child panel deactivated" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to deactivate" });
  }
};

//CHILD PANEL DETAILS
export const getChildPanelDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const resellerPage = Number(req.query.resellerPage) || 1;
    const userPage     = Number(req.query.userPage)     || 1;
    const orderPage    = Number(req.query.orderPage)    || 1;
    const limit        = Number(req.query.limit)        || 15;

    if (!isValidId(id)) {
      return res.status(400).json({ success: false, message: "Invalid ID" });
    }

    const cpDoc = await User.findById(id);
    if (!cpDoc || !cpDoc.isChildPanel) {
      return res.status(404).json({ success: false, message: "Child panel not found" });
    }

    // Auto-suspend on read if billing has expired but the DB hasn't caught
    // up yet (cron only runs once daily). This keeps the admin view in sync
    // immediately, exactly like a manual suspend, without waiting for cron.
    // Only triggers on billing expiry — never touches a manual suspension.
    if (
      cpDoc.childPanelNextBilledAt &&
      new Date() > new Date(cpDoc.childPanelNextBilledAt) &&
      !cpDoc.childPanelSubscriptionSuspended
    ) {
      cpDoc.childPanelSubscriptionSuspended = true;
      cpDoc.childPanelIsActive = false;
      cpDoc.childPanelSuspendReason =
        "Subscription fee unpaid — panel suspended. Please pay your subscription fee to reactivate.";
      await cpDoc.save();
    }

    const cp = cpDoc.toObject();

    // Resolve effective billing interval (panel override → global default)
    const settings = await Settings.findOne().lean();
    const effectiveIntervalDays =
      cp.childPanelBillingIntervalDays ??
      Number(settings?.childPanelBillingIntervalDays ?? 30);

    // ── Resolve per-CP overrides → fall back to global defaults ──
    const effectiveGraceHours    = cp.childPanelGracePeriodHours ?? settings?.childPanelGracePeriodHours ?? 0;
    const effectiveReminderHours = cp.childPanelReminderHours    ?? settings?.childPanelReminderHours    ?? 48;
    const effectiveAutoDeduct    = cp.childPanelAutoDeduct       ?? settings?.childPanelAutoDeduct       ?? true;

    // ── Resolve tiered billing + the actual fee currently due ──
    const tiers = settings?.childPanelMonthlyTiers ?? [];
    const ordersThisCycle = cp.childPanelOrdersThisCycle ?? 0;
    const currentTierIndex = tiers.length > 0
      ? tiers.findIndex((t) => ordersThisCycle >= t.minOrders && (t.maxOrders === null || ordersThisCycle <= t.maxOrders))
      : -1;
    const currentFee = resolveChildPanelFee(cp, settings);

    // Subscription status derived fields
    const now = new Date();
    const nextBilledAt = cp.childPanelNextBilledAt
      ? new Date(cp.childPanelNextBilledAt)
      : null;
    const subscriptionExpired = nextBilledAt ? now > nextBilledAt : false;
    const daysUntilExpiry = nextBilledAt
      ? Math.ceil((nextBilledAt - now) / (1000 * 60 * 60 * 24))
      : null;

    // Grace deadline
    const graceDeadline = nextBilledAt
      ? new Date(nextBilledAt.getTime() + effectiveGraceHours * 60 * 60 * 1000)
      : null;

    // Reminder window active?
    const reminderActive = nextBilledAt
      ? (now >= new Date(nextBilledAt.getTime() - effectiveReminderHours * 60 * 60 * 1000)) && !subscriptionExpired
      : false;

    const [resellers, users, orders, totalResellers, totalUsers, totalOrders] =
      await Promise.all([
        User.find({ isReseller: true, childPanelOwner: id })
          .select("email phone brandName resellerDomain isSuspended createdAt")
          .sort({ createdAt: -1 })
          .skip((resellerPage - 1) * limit)
          .limit(limit)
          .lean(),

        // Option B: all users under this CP (resellers + end users), excluding admin/cp accounts
        User.find({
          childPanelOwner: id,
          isAdmin:      { $ne: true },
          isChildPanel: { $ne: true },
        })
          .select("email phone balance isBlocked isFrozen lastSeen createdAt isReseller")
          .sort({ createdAt: -1 })
          .skip((userPage - 1) * limit)
          .limit(limit)
          .lean(),

        Order.find({ childPanelOwner: id })
          .sort({ createdAt: -1 })
          .skip((orderPage - 1) * limit)
          .limit(limit)
          .lean(),

        User.countDocuments({ isReseller: true, childPanelOwner: id }),
        User.countDocuments({
          childPanelOwner: id,
          isAdmin:      { $ne: true },
          isChildPanel: { $ne: true },
        }),
        Order.countDocuments({ childPanelOwner: id }),
      ]);

    // Use aggregation for revenue/earnings so we never load all orders into memory
    const [revenueAgg] = await Order.aggregate([
      { $match: { childPanelOwner: new mongoose.Types.ObjectId(id) } },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalRevenue: {
            $sum: {
              $cond: [
                { $not: [{ $in: ["$status", ["failed", "refunded"]] }] },
                { $toDouble: { $ifNull: ["$charge", 0] } },
                0,
              ],
            },
          },
          totalEarnings: {
            $sum: {
              $cond: [
                { $eq: ["$childPanelEarningsCredited", true] },
                { $toDouble: { $ifNull: ["$childPanelCommission", 0] } },
                0,
              ],
            },
          },
        },
      },
    ]);

    const totalOrderCount = revenueAgg?.totalOrders  ?? 0;
    const totalRevenue    = revenueAgg?.totalRevenue  ?? 0;
    const totalEarnings   = revenueAgg?.totalEarnings ?? 0;
    const wallet = await Wallet.findOne({ user: cp._id }).lean();

    res.json({
      success: true,
      data: {
        childPanel: {
          ...cp,
          effectiveIntervalDays,
          effectiveGraceHours,
          effectiveReminderHours,
          effectiveAutoDeduct,
          graceDeadline,
          reminderActive,
          subscriptionExpired,
          daysUntilExpiry,
          subscriptionSuspended: cp.childPanelSubscriptionSuspended ?? false,
          monthlyTiers: tiers,
          currentTierIndex,
          currentFee,
        },
        stats: {
          walletBalance: formatNumber(wallet?.balance || 0),
          totalOrders:      totalOrderCount,
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
          resellerPage, totalResellers, resellerPages: Math.ceil(totalResellers / limit),
          userPage,     totalUsers,     userPages:     Math.ceil(totalUsers     / limit),
          orderPage,    totalOrders,    orderPages:    Math.ceil(totalOrders    / limit),
        },
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to fetch details" });
  }
};

//RESET CHILDPANEL BILLING
export const resetChildPanelBilling = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({ success: false, message: "Invalid ID" });
    }

    const [cp, settings] = await Promise.all([
      User.findById(id),
      Settings.findOne().lean(),
    ]);

    if (!cp || !cp.isChildPanel) {
      return res.status(404).json({ success: false, message: "Child panel not found" });
    }

    // Copy global defaults onto this panel
    cp.childPanelBillingMode         = settings?.childPanelBillingMode   ?? "monthly";
    cp.childPanelMonthlyFee          = Number(settings?.childPanelMonthlyFee  ?? 20);
    cp.childPanelPerOrderFee         = Number(settings?.childPanelPerOrderFee ?? 0);
    cp.childPanelBillingIntervalDays = null; // null = follow global
    cp.childPanelFeeIsCustom         = false;

    // Reset the billing clock from today
    const intervalDays = Number(settings?.childPanelBillingIntervalDays ?? 30);
    const now = new Date();
    cp.childPanelLastBilledAt = now;
    cp.childPanelNextBilledAt = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000);

    await cp.save();
    res.json({ success: true, message: "Billing reset to global default" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to reset billing" });
  }
};

// ======================= UPDATE PLATFORM RESELLER FEE OVERRIDE =======================
// Admin-only. null = inherit global Settings.platformResellerActivationFee.

export const updatePlatformResellerFeeOverride = async (req, res) => {
  try {
    const { id } = req.params;
    const { fee } = req.body;

    const isEmpty = fee === null || fee === "";
    const value = isEmpty ? null : Number(fee);

    if (!isEmpty && (isNaN(value) || value < 0)) {
      return res.status(400).json({ success: false, message: "Fee must be 0 or greater, or blank for global default" });
    }

    if (!isValidId(id)) {
      return res.status(400).json({ success: false, message: "Invalid ID" });
    }

    const cp = await User.findOne({ _id: id, isChildPanel: true });
    if (!cp) return res.status(404).json({ success: false, message: "Child panel not found" });

    cp.platformResellerFeeOverride = value;
    await cp.save();

    res.json({ success: true, platformResellerFeeOverride: value });
  } catch (error) {
    console.error("UPDATE PLATFORM RESELLER FEE OVERRIDE ERROR:", error);
    res.status(500).json({ success: false, message: "Failed to update fee override" });
  }
};

/* ================================================
   CREDIT CHILD PANEL WALLET
   Admin manually tops up the CP owner's normal wallet.
   After crediting, if the panel is subscription-suspended
   and the wallet now covers the fee, auto-reactivate.
================================================ */
export const creditChildPanelWallet = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, note } = req.body;

    if (!isValidId(id)) {
      return res.status(400).json({ success: false, message: "Invalid ID" });
    }

    const creditAmount = Number(amount);
    if (!creditAmount || creditAmount <= 0) {
      return res.status(400).json({ success: false, message: "Amount must be a positive number" });
    }

    const cp = await User.findById(id);
    if (!cp || !cp.isChildPanel) {
      return res.status(404).json({ success: false, message: "Child panel not found" });
    }

    let wallet = await Wallet.findOne({ user: cp._id });
    if (!wallet) {
      wallet = await Wallet.create({ user: cp._id, balance: 0, transactions: [] });
    }

    wallet.transactions.push({
      type: "Admin Adjustment",
      amount: creditAmount,
      status: "Completed",
      note: note || "Admin top-up",
      createdAt: new Date(),
    });
    wallet.balance = calculateBalance(wallet.transactions);
    await wallet.save();
    await User.findByIdAndUpdate(cp._id, { balance: wallet.balance });

    const { reactivated: autoReactivated, newBalance, resumedResellers } = await onCpWalletCredited(cp, req.app.get("io"));
    
    res.json({
      success: true,
      message: autoReactivated
        ? `Credited $${creditAmount.toFixed(2)} and auto-deducted fee — panel reactivated`
        : `Credited $${creditAmount.toFixed(2)} to wallet`,
      newBalance,
      autoReactivated,
      isActive: cp.childPanelIsActive,
      note: note || null,
    });
  } catch (error) {
    console.error("CREDIT WALLET ERROR:", error);
    res.status(500).json({ success: false, message: "Failed to credit wallet" });
  }
};


/* ================================================
   REOPEN / EXTEND SUBSCRIPTION
   Modes:
     "next_cycle"  — deduct fee and push nextBilledAt by one interval from now
     "grace"       — extend grace deadline by N hours/days without charging
================================================ */

export const reopenChildPanelSubscription = async (req, res) => {
  try {
    const { id } = req.params;
    const { mode, graceHours } = req.body;
    // mode: "next_cycle" | "grace"
    // graceHours: number (only used when mode === "grace")

    if (!isValidId(id)) {
      return res.status(400).json({ success: false, message: "Invalid ID" });
    }

    const [cp, settings] = await Promise.all([
      User.findById(id),
      Settings.findOne().lean(),
    ]);

    if (!cp || !cp.isChildPanel) {
      return res.status(404).json({ success: false, message: "Child panel not found" });
    }

    const now = new Date();

    if (mode === "next_cycle") {
      // Resolve fee
      const fee = resolveChildPanelFee(cp, settings);
      const effectiveIntervalDays =
        cp.childPanelBillingIntervalDays ??
        Number(settings?.childPanelBillingIntervalDays ?? 30);

      let wallet = await Wallet.findOne({ user: cp._id });
      if (!wallet) {
        wallet = await Wallet.create({ user: cp._id, balance: 0, transactions: [] });
      }

      // Deduct fee if applicable and wallet has funds; skip deduction if fee=0 or insufficient
      if (fee > 0 && wallet.balance < fee) {
        // Allow admin to force-reopen even with insufficient wallet (skip deduction)
        // — just push the cycle and log warning. Admin's choice.
        console.warn(`[ReopenCP] CP ${cp._id} has insufficient wallet ($${wallet.balance}) for fee $${fee}. Reopening without deduction.`);
      } else if (fee > 0) {
        wallet.transactions.push({
          type: "Admin Adjustment",
          amount: -Number(fee),
          status: "Completed",
          note: "Child panel subscription fee — admin reopen",
          createdAt: new Date(),
        });
        wallet.balance = wallet.transactions
          .filter((t) => t.status === "Completed")
          .reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
        await wallet.save();
        await User.findByIdAndUpdate(cp._id, { balance: wallet.balance });
      }

      cp.childPanelLastBilledAt          = now;
      cp.childPanelNextBilledAt          = new Date(now.getTime() + effectiveIntervalDays * 24 * 60 * 60 * 1000);
      cp.childPanelOrdersThisCycle       = 0;
      cp.childPanelSubscriptionSuspended = false;
      cp.childPanelIsActive              = true;
      cp.childPanelSuspendReason         = null;

      await cp.save();

      return res.json({
        success: true,
        message: `Panel reopened. Next billing: ${cp.childPanelNextBilledAt.toISOString()}`,
        nextBilledAt: cp.childPanelNextBilledAt,
        isActive: true,
        newWallet: wallet.balance,
      });
    }

    if (mode === "grace") {
      const hours = Number(graceHours);
      if (!hours || hours <= 0) {
        return res.status(400).json({ success: false, message: "graceHours must be a positive number" });
      }

      // Extend nextBilledAt by the grace hours from NOW (so grace deadline = new nextBilledAt + grace)
      // More intuitive: set nextBilledAt = now + graceHours so the panel is live for that window
      const graceExpiry = new Date(now.getTime() + hours * 60 * 60 * 1000);

      cp.childPanelNextBilledAt          = graceExpiry;
      cp.childPanelSubscriptionSuspended = false;
      cp.childPanelIsActive              = true;
      cp.childPanelSuspendReason         = null;

      await cp.save();

      return res.json({
        success: true,
        message: `Panel reopened with ${hours}h grace. Expires: ${graceExpiry.toISOString()}`,
        nextBilledAt: graceExpiry,
        isActive: true,
      });
    }

    return res.status(400).json({ success: false, message: "mode must be 'next_cycle' or 'grace'" });
  } catch (error) {
    console.error("REOPEN SUBSCRIPTION ERROR:", error);
    res.status(500).json({ success: false, message: "Failed to reopen subscription" });
  }
};
