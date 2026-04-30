// controllers/childPanelController.js

import User from "../models/User.js";
import Order from "../models/Order.js";
import Settings from "../models/Settings.js";
import Wallet from "../models/Wallet.js";

/* ================================================
   HELPERS
================================================ */

const normalizeDomain = (domain) => {
  return domain
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .trim();
};

const calculateBalance = (transactions) => {
  return transactions.reduce((balance, transaction) => {
    return balance + (transaction.amount || 0);
  }, 0);
};

/* ================================================
   GET CHILD PANEL ACTIVATION FEE
   Returns current fee — shows offer price if active
================================================ */

export const getChildPanelActivationFee = async (req, res) => {
  try {
    const settings = await Settings.findOne().lean();

    const offerActive =
      settings?.childPanelOfferActive &&
      (!settings?.childPanelOfferExpiresAt ||
        new Date(settings.childPanelOfferExpiresAt) > new Date());

    res.json({
      fee: offerActive
        ? settings.childPanelOfferActivationFee
        : settings?.childPanelActivationFee || 100,
      monthlyFee: offerActive
        ? settings.childPanelOfferMonthlyFee
        : settings?.childPanelMonthlyFee || 20,
      billingMode: settings?.childPanelBillingMode || "monthly",
      perOrderFee: settings?.childPanelPerOrderFee || 0,
      offerActive: offerActive || false,
      offerLabel: offerActive ? settings.childPanelOfferLabel : null,
      offerExpiresAt: offerActive ? settings.childPanelOfferExpiresAt : null,
      platformDomain: settings?.platformDomain || "marinepanel.online",
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch activation fee" });
  }
};

/* ================================================
   ACTIVATE CHILD PANEL
   User pays activation fee from their wallet
   Gets their own child panel with a slug for testing
   or custom domain for production
================================================ */

export const activateChildPanel = async (req, res) => {
  try {
    const userId = req.user._id;
    const { brandName, slug, customDomain } = req.body;

    if (!brandName) {
      return res.status(400).json({ message: "Brand name is required" });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.isChildPanel) {
      return res.status(400).json({ message: "Already a child panel owner" });
    }

    // Determine slug from brandName if not provided
    const finalSlug = slug
      ? slug.toLowerCase().trim().replace(/\s+/g, "").replace(/[^a-z0-9]/g, "")
      : brandName.toLowerCase().trim().replace(/\s+/g, "").replace(/[^a-z0-9]/g, "");

    // Check slug is unique
    const slugExists = await User.findOne({ childPanelSlug: finalSlug });
    if (slugExists) {
      return res.status(400).json({ message: "Brand slug already taken" });
    }

    // Check custom domain uniqueness if provided
    if (customDomain) {
      const cleanDomain = normalizeDomain(customDomain);
      const domainExists = await User.findOne({ childPanelDomain: cleanDomain });
      if (domainExists) {
        return res.status(400).json({ message: "Domain already in use" });
      }
    }

    // Get current fees — respect active offer
    const settings = await Settings.findOne().lean();

    const offerActive =
      settings?.childPanelOfferActive &&
      (!settings?.childPanelOfferExpiresAt ||
        new Date(settings.childPanelOfferExpiresAt) > new Date());

    const activationFee = offerActive
      ? settings.childPanelOfferActivationFee
      : settings?.childPanelActivationFee || 100;

    const monthlyFee = offerActive
      ? settings.childPanelOfferMonthlyFee
      : settings?.childPanelMonthlyFee || 20;

    const wallet = await Wallet.findOne({ user: userId });
    if (!wallet) return res.status(404).json({ message: "Wallet not found" });

    if (wallet.balance < activationFee) {
      return res.status(400).json({
        message: `You need $${activationFee} to activate a child panel`,
      });
    }

    // Deduct activation fee
    wallet.transactions.push({
      type: "CP Activation Fee",
      amount: -Number(activationFee),
      status: "Completed",
      note: "Child panel activation fee",
      reference: `CP-ACT-${userId}`,
      createdAt: new Date(),
    });

    wallet.balance = calculateBalance(wallet.transactions);
    await wallet.save();

    // Activate child panel on user
    user.isChildPanel = true;
    user.childPanelIsActive = true;
    user.childPanelActivatedAt = new Date();
    user.childPanelBrandName = brandName;
    user.childPanelSlug = finalSlug;
    user.childPanelDomain = customDomain ? normalizeDomain(customDomain) : null;
    user.childPanelMonthlyFee = monthlyFee;
    user.childPanelBillingMode = settings?.childPanelBillingMode || "monthly";
    user.childPanelPerOrderFee = settings?.childPanelPerOrderFee || 0;
    user.childPanelWithdrawMin = settings?.childPanelWithdrawMin || 10;
    user.childPanelResellerActivationFee = 25; // default, they can change later

    await user.save();

    // Sync user balance
    await User.findByIdAndUpdate(userId, { balance: wallet.balance });

    const platformDomain = settings?.platformDomain || "marinepanel.online";

    res.json({
      message: "Child panel activated successfully",
      slug: finalSlug,
      domain: customDomain
        ? normalizeDomain(customDomain)
        : `${finalSlug}.${platformDomain}`,
      remainingBalance: wallet.balance,
    });
  } catch (error) {
    console.error("CHILD PANEL ACTIVATION ERROR:", error);
    res.status(500).json({ message: "Activation failed" });
  }
};

/* ================================================
   DASHBOARD
   Stats scoped to this child panel owner
================================================ */

export const getChildPanelDashboard = async (req, res) => {
  try {
    const ownerId = req.user._id;

    const [resellersCount, usersCount, orders, wallet] = await Promise.all([
      // Resellers that belong to this child panel
      User.countDocuments({ isReseller: true, childPanelOwner: ownerId }),

      // All users under those resellers
      User.countDocuments({ childPanelOwner: ownerId }),

      // All orders on this child panel
      Order.find({ childPanelOwner: ownerId }).lean(),

      Wallet.findOne({ user: ownerId }).lean(),
    ]);

    let totalOrders = orders.length;
    let totalRevenue = 0;
    let earnings = 0;
    let pendingOrders = 0;

    for (const order of orders) {
      if (order.status === "completed") {
        totalRevenue += Number(order.charge || 0);
      }
      if (order.childPanelEarningsCredited) {
        earnings += Number(order.childPanelCommission || 0);
      }
      if (order.status === "pending") {
        pendingOrders++;
      }
    }

    res.json({
      resellers: resellersCount,
      users: usersCount,
      orders: totalOrders,
      pendingOrders,
      revenue: totalRevenue,
      earnings,
      wallet: wallet?.balance || 0,
      childPanelWallet: req.user.childPanelWallet || 0,
      brandName: req.user.childPanelBrandName,
      domain: req.user.childPanelDomain || req.user.childPanelSlug,
      billingMode: req.user.childPanelBillingMode,
      monthlyFee: req.user.childPanelMonthlyFee,
      lastBilledAt: req.user.childPanelLastBilledAt,
    });
  } catch (error) {
    console.error("CHILD PANEL DASHBOARD ERROR:", error);
    res.status(500).json({ message: "Dashboard failed" });
  }
};

/* ================================================
   GET RESELLERS UNDER THIS CHILD PANEL
================================================ */

export const getChildPanelResellers = async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const [resellers, total] = await Promise.all([
      User.find({ isReseller: true, childPanelOwner: req.user._id })
        .select("-password")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      User.countDocuments({ isReseller: true, childPanelOwner: req.user._id }),
    ]);

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
    res.status(500).json({ message: "Failed to fetch resellers" });
  }
};

/* ================================================
   GET USERS UNDER THIS CHILD PANEL
================================================ */

export const getChildPanelUsers = async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      User.find({ childPanelOwner: req.user._id, isReseller: false })
        .select("-password")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      User.countDocuments({ childPanelOwner: req.user._id, isReseller: false }),
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
    res.status(500).json({ message: "Failed to fetch users" });
  }
};

/* ================================================
   GET ORDERS UNDER THIS CHILD PANEL
================================================ */

export const getChildPanelOrders = async (req, res) => {
  try {
    const { status, from, to } = req.query;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const query = { childPanelOwner: req.user._id };

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
        .populate("userId", "email phone")
        .populate("resellerOwner", "email brandName")
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
    res.status(500).json({ message: "Failed to fetch orders" });
  }
};

/* ================================================
   TOGGLE RESELLER STATUS
   Child panel owner can suspend/activate their resellers
================================================ */

export const toggleChildPanelResellerStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const reseller = await User.findOne({
      _id: id,
      isReseller: true,
      childPanelOwner: req.user._id,
    });

    if (!reseller) {
      return res.status(404).json({ message: "Reseller not found" });
    }

    reseller.isSuspended = !reseller.isSuspended;
    await reseller.save();

    // Suspend users under this reseller if suspending
    if (reseller.isSuspended) {
      await User.updateMany(
        { resellerOwner: reseller._id, isSuspended: false },
        { $set: { isSuspended: true } }
      );
    }

    res.json({
      success: true,
      message: `Reseller ${reseller.isSuspended ? "suspended" : "activated"}`,
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to update reseller status" });
  }
};

/* ================================================
   UPDATE RESELLER COMMISSION
   Child panel owner sets commission for their resellers
================================================ */

export const updateChildPanelResellerCommission = async (req, res) => {
  try {
    const { id } = req.params;
    const { commission } = req.body;

    const rate = Number(commission);

    if (isNaN(rate) || rate < 0 || rate > 100) {
      return res.status(400).json({
        message: "Commission must be between 0 and 100",
      });
    }

    const reseller = await User.findOne({
      _id: id,
      isReseller: true,
      childPanelOwner: req.user._id,
    });

    if (!reseller) {
      return res.status(404).json({ message: "Reseller not found" });
    }

    reseller.resellerCommissionRate = rate;
    await reseller.save();

    res.json({ success: true, message: "Commission updated" });
  } catch (error) {
    res.status(500).json({ message: "Failed to update commission" });
  }
};

/* ================================================
   UPDATE CHILD PANEL BRANDING
================================================ */

export const updateChildPanelBranding = async (req, res) => {
  try {
    const {
      brandName,
      logo,
      themeColor,
      supportWhatsapp,
      supportTelegram,
      supportWhatsappChannel,
    } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (brandName) user.childPanelBrandName = brandName;
    if (logo !== undefined) user.childPanelLogo = logo;
    if (themeColor) user.childPanelThemeColor = themeColor;
    if (supportWhatsapp !== undefined) user.childPanelSupportWhatsapp = supportWhatsapp;
    if (supportTelegram !== undefined) user.childPanelSupportTelegram = supportTelegram;
    if (supportWhatsappChannel !== undefined) user.childPanelSupportWhatsappChannel = supportWhatsappChannel;

    await user.save();

    res.json({ success: true, message: "Branding updated" });
  } catch (error) {
    res.status(500).json({ message: "Failed to update branding" });
  }
};

/* ================================================
   UPDATE CHILD PANEL DOMAIN
   Switch between slug (testing) and custom domain (production)
================================================ */

export const updateChildPanelDomain = async (req, res) => {
  try {
    const { customDomain } = req.body;

    const user = await User.findById(req.user._id);
    if (!user || !user.isChildPanel) {
      return res.status(404).json({ message: "Child panel not found" });
    }

    const cleanDomain = normalizeDomain(customDomain);

    // Check domain not already taken by another child panel
    const exists = await User.findOne({
      childPanelDomain: cleanDomain,
      _id: { $ne: user._id },
    });

    if (exists) {
      return res.status(400).json({ message: "Domain already in use" });
    }

    user.childPanelDomain = cleanDomain;
    await user.save();

    res.json({
      success: true,
      message: "Domain updated",
      domain: cleanDomain,
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to update domain" });
  }
};

/* ================================================
   UPDATE CHILD PANEL SETTINGS
   Child panel owner sets their own reseller fees
================================================ */

export const updateChildPanelSettings = async (req, res) => {
  try {
    const { resellerActivationFee, commissionRate, withdrawMin } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (resellerActivationFee !== undefined) {
      user.childPanelResellerActivationFee = Number(resellerActivationFee);
    }
    if (commissionRate !== undefined) {
      user.childPanelCommissionRate = Number(commissionRate);
    }
    if (withdrawMin !== undefined) {
      user.childPanelWithdrawMin = Number(withdrawMin);
    }

    await user.save();

    res.json({ success: true, message: "Settings updated" });
  } catch (error) {
    res.status(500).json({ message: "Failed to update settings" });
  }
};

/* ================================================
   WITHDRAW FROM CHILD PANEL WALLET
================================================ */

export const withdrawChildPanelFunds = async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: "Invalid amount" });
    }

    const user = await User.findById(req.user._id);

    if (amount < user.childPanelWithdrawMin) {
      return res.status(400).json({
        message: `Minimum withdrawal is $${user.childPanelWithdrawMin}`,
      });
    }

    if (user.childPanelWallet < amount) {
      return res.status(400).json({ message: "Insufficient balance" });
    }

    user.childPanelWallet -= Number(amount);
    await user.save();

    res.json({
      success: true,
      message: "Withdrawal successful",
      remainingBalance: user.childPanelWallet,
    });
  } catch (error) {
    res.status(500).json({ message: "Withdrawal failed" });
  }
};
