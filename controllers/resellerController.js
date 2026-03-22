// controllers/resellerController.js

import User from "../models/User.js";
import Order from "../models/Order.js";
import Settings from "../models/Settings.js";
import Wallet from "../models/Wallet.js";

/*
--------------------------------
Helpers
--------------------------------
*/

const generateSlug = (brandName) =>
  brandName.toLowerCase().trim().replace(/\s+/g, "").replace(/[^a-z0-9]/g, "");

const normalizeDomain = (domain) =>
  domain
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .trim();

/*
--------------------------------
Activate Reseller
--------------------------------
*/

export const activateReseller = async (req, res) => {
  try {
    const userId = req.user._id;
    const { brandName, domainType, customDomain } = req.body;

    if (!brandName) {
      return res.status(400).json({ message: "Brand name required" });
    }

    const slug = generateSlug(brandName);

    const existingBrand = await User.findOne({ brandSlug: slug });
    if (existingBrand) {
      return res.status(400).json({ message: "Brand already taken" });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.isReseller) {
      return res.status(400).json({ message: "Already a reseller" });
    }

    const settings = await Settings.findOne().lean();
    const activationFee = settings?.resellerActivationFee || 25;
    const platformDomain = settings?.platformDomain || "marinepanel.online";

    const wallet = await Wallet.findOne({ user: user._id });
    if (!wallet) return res.status(404).json({ message: "Wallet not found" });

    if (wallet.balance < activationFee) {
      return res.status(400).json({
        message: `Need $${activationFee} to activate`,
      });
    }

    let finalDomain = "";

    /* ===== SUBDOMAIN ===== */
    if (domainType === "subdomain") {
      finalDomain = `${slug}.${platformDomain}`;

      const exists = await User.findOne({ resellerDomain: finalDomain });
      if (exists) {
        return res.status(400).json({ message: "Subdomain in use" });
      }
    }

    /* ===== CUSTOM DOMAIN ===== */
    if (domainType === "custom") {
      if (!customDomain) {
        return res.status(400).json({ message: "Custom domain required" });
      }

      const clean = normalizeDomain(customDomain);

      const exists = await User.findOne({ resellerDomain: clean });
      if (exists) {
        return res.status(400).json({ message: "Domain in use" });
      }

      finalDomain = clean;
    }

    /* ===== ACTIVATE ===== */
    user.isReseller = true;
    user.brandName = brandName;
    user.brandSlug = slug;
    user.resellerDomain = finalDomain;
    user.themeColor = "#16a34a";
    user.resellerActivatedAt = new Date();

    /* ===== WALLET ===== */
    wallet.balance -= activationFee;

    wallet.transactions.push({
      type: "debit",
      amount: activationFee,
      status: "completed",
      description: "Reseller activation fee",
      reference: "activation",
      createdAt: new Date(),
    });

    await Promise.all([user.save(), wallet.save()]);

    res.json({
      message: "Reseller activated",
      domain: finalDomain,
      balance: wallet.balance,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Activation failed" });
  }
};

/*
--------------------------------
Dashboard (FIXED CORRECTLY)
--------------------------------
*/

export const getResellerDashboard = async (req, res) => {
  try {
    const resellerId = req.reseller?._id || req.user._id;

    const [usersCount, ordersCount, stats, wallet, user] = await Promise.all([

      User.countDocuments({ resellerOwner: resellerId }),

      Order.countDocuments({ resellerOwner: resellerId }),

      Order.aggregate([
        {
          $match: {
            resellerOwner: resellerId,
            status: { $nin: ["failed", "refunded", "cancelled"] },
          },
        },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: "$charge" },
          },
        },
      ]),

      // 🔥 ONLY COUNT CREDITED EARNINGS
      Order.aggregate([
        {
          $match: {
            resellerOwner: resellerId,
            earningsCredited: true,
          },
        },
        {
          $group: {
            _id: null,
            earnings: { $sum: "$resellerCommission" },
          },
        },
      ]),

      Wallet.findOne({ user: resellerId }).lean(),

      User.findById(resellerId).lean(),
    ]);

    res.json({
      users: usersCount,
      orders: ordersCount,
      totalRevenue: stats[0]?.totalRevenue || 0,
      earnings: stats[1]?.earnings || 0,
      wallet: wallet?.balance || 0,
      domain: user?.resellerDomain || null,
      brandName: user?.brandName || null,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Dashboard failed" });
  }
};

/*
--------------------------------
Users
--------------------------------
*/

export const getResellerUsers = async (req, res) => {
  try {
    const resellerId = req.reseller?._id || req.user._id;

    const users = await User.find({ resellerOwner: resellerId })
      .select("-password")
      .sort({ createdAt: -1 })
      .lean();

    res.json(users);
  } catch (error) {
    res.status(500).json({ message: "Users fetch failed" });
  }
};

/*
--------------------------------
Orders
--------------------------------
*/

export const getResellerOrders = async (req, res) => {
  try {
    const resellerId = req.reseller?._id || req.user._id;

    const orders = await Order.find({ resellerOwner: resellerId })
      .sort({ createdAt: -1 })
      .lean();

    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: "Orders fetch failed" });
  }
};

/*
--------------------------------
Withdraw (SAFE)
--------------------------------
*/

export const withdrawResellerFunds = async (req, res) => {
  try {
    let { amount } = req.body;

    amount = Number(amount);

    const settings = await Settings.findOne().lean();
    const minWithdraw = settings?.resellerWithdrawMin || 10;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: "Invalid amount" });
    }

    if (amount < minWithdraw) {
      return res.status(400).json({
        message: `Minimum withdraw is $${minWithdraw}`,
      });
    }

    const wallet = await Wallet.findOne({ user: req.user._id });

    if (!wallet || wallet.balance < amount) {
      return res.status(400).json({
        message: "Insufficient wallet balance",
      });
    }

    wallet.balance -= amount;

    wallet.transactions.push({
      type: "debit",
      amount,
      status: "completed",
      description: "Reseller withdrawal",
      reference: "withdrawal",
      createdAt: new Date(),
    });

    await wallet.save();

    res.json({
      message: "Withdrawal successful",
      balance: wallet.balance,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Withdraw failed" });
  }
};

/*
--------------------------------
Branding
--------------------------------
*/

export const updateBranding = async (req, res) => {
  try {
    const user = req.user;
    const { brandName, logo, themeColor } = req.body;

    if (!user.isReseller) {
      return res.status(403).json({
        message: "Only resellers can update branding",
      });
    }

    if (brandName !== undefined) {
      const slug = generateSlug(brandName);

      const exists = await User.findOne({
        brandSlug: slug,
        _id: { $ne: user._id },
      });

      if (exists) {
        return res.status(400).json({
          message: "Brand already exists",
        });
      }

      user.brandName = brandName;
      user.brandSlug = slug;
    }

    if (logo !== undefined) user.logo = logo;
    if (themeColor !== undefined) user.themeColor = themeColor;

    await user.save();

    res.json({
      message: "Brand updated",
      brandName: user.brandName,
      logo: user.logo,
      themeColor: user.themeColor,
    });

  } catch (error) {
    res.status(500).json({ message: "Brand update failed" });
  }
};
