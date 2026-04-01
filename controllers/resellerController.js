// controllers/resellerController.js

import User from "../models/User.js";
import Order from "../models/Order.js";
import Settings from "../models/Settings.js";
import Wallet from "../models/Wallet.js";

/* ================================================
   HELPERS
================================================ */

const generateSlug = (brandName) => {
  return brandName
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9]/g, "");
};

const normalizeDomain = (domain) => {
  return domain
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .trim();
};

/* ================================================
   ACTIVATE RESELLER
================================================ */

export const activateReseller = async (req, res) => {
  try {
    const userId = req.user._id;
    const { brandName, domainType, customDomain } = req.body;

    if (!brandName) {
      return res.status(400).json({ message: "Brand name required" });
    }

    const user = await User.findById(userId);

    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.isSuspended) {
      return res.status(403).json({ message: "Account suspended" });
    }

    if (user.isReseller) {
      return res.status(400).json({ message: "Already a reseller" });
    }

    const slug = generateSlug(brandName);

    const existingBrand = await User.findOne({ brandSlug: slug });
    if (existingBrand) {
      return res.status(400).json({ message: "Brand already taken" });
    }

    const settings = await Settings.findOne().lean();

    const activationFee = settings?.resellerActivationFee || 25;
    const platformDomain = settings?.platformDomain || "marinepanel.online";

    const wallet = await Wallet.findOne({ user: user._id });

    if (!wallet) {
      return res.status(404).json({ message: "Wallet not found" });
    }

    if (wallet.balance < activationFee) {
      return res.status(400).json({
        message: `You need $${activationFee} to activate reseller`,
      });
    }

    let finalDomain = "";

    if (domainType === "subdomain") {
      finalDomain = `${slug}.${platformDomain}`;

      const exists = await User.findOne({ resellerDomain: finalDomain });
      if (exists) {
        return res.status(400).json({ message: "Subdomain already in use" });
      }
    }

    if (domainType === "custom") {
      if (!customDomain) {
        return res.status(400).json({ message: "Custom domain required" });
      }

      const cleanDomain = normalizeDomain(customDomain);

      const exists = await User.findOne({ resellerDomain: cleanDomain });
      if (exists) {
        return res.status(400).json({ message: "Domain already in use" });
      }

      finalDomain = cleanDomain;
    }

    /* ===== ACTIVATE ===== */

    user.isReseller = true;
    user.brandName = brandName;
    user.brandSlug = slug;
    user.resellerDomain = finalDomain;
    user.themeColor = "#16a34a";
    user.resellerActivatedAt = new Date();

    /* ===== WALLET DEDUCTION ===== */

    wallet.transactions.push({
      type: "Activation",
      amount: -Number(activationFee),
      status: "Completed",
      note: "Reseller activation fee",
      date: new Date(),
    });

    wallet.balance = calculateBalance(wallet.transactions);

    await wallet.save();
    await user.save();

    res.json({
      message: "Reseller activated successfully",
      domain: finalDomain,
      remainingBalance: wallet.balance,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Activation failed" });
  }
};

/* ================================================
   GET ACTIVATION FEE
================================================ */

export const getActivationFee = async (req, res) => {
  try {
    const settings = await Settings.findOne().lean();

    res.json({
      fee: settings?.resellerActivationFee || 25,
      platformDomain: settings?.platformDomain || "marinepanel.online",
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch fee" });
  }
};

/* ================================================
   DASHBOARD (FIXED)
================================================ */

export const getResellerDashboard = async (req, res) => {
  try {
    const resellerId = req.user._id;

    const [usersCount, orders, wallet, user] = await Promise.all([
      User.countDocuments({ resellerOwner: resellerId }),
      Order.find({ resellerOwner: resellerId }).lean(),
      Wallet.findOne({ user: resellerId }).lean(),
      User.findById(resellerId).lean(),
    ]);

    let totalOrders = orders.length;
    let totalRevenue = 0;
    let earnings = 0;

    for (const order of orders) {
      // ✅ Revenue = ONLY completed orders
      if (order.status === "completed") {
       totalRevenue += Number(order.charge || 0);
     }

      if (order.earningsCredited) {
        earnings += Number(order.resellerCommission || 0);
      }
    }

    res.json({
      users: usersCount,
      orders: totalOrders,
      revenue: totalRevenue,
      earnings,
      wallet: wallet?.balance || 0,
      domain: user?.resellerDomain,
      brandName: user?.brandName,
    });

  } catch (error) {
    res.status(500).json({ message: "Dashboard failed" });
  }
};

/* ================================================
   USERS
================================================ */

export const getResellerUsers = async (req, res) => {
  try {
    const users = await User.find({
      resellerOwner: req.user._id,
    })
      .select("-password")
      .lean();

    res.json(users);
  } catch {
    res.status(500).json({ message: "Failed" });
  }
};

/* ================================================
   ORDERS
================================================ */

export const getResellerOrders = async (req, res) => {
  try {
    const orders = await Order.find({
      resellerOwner: req.user._id,
    }).lean();

    const formatted = orders.map((o) => ({
      ...o,
      resellerCommission:
        o.status === "completed" && o.earningsCredited
          ? o.resellerCommission
          : 0,
    }));

    res.json(formatted);
  } catch {
    res.status(500).json({ message: "Failed" });
  }
};

/* ================================================
   WITHDRAW (FIXED)
================================================ */

export const withdrawResellerFunds = async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: "Invalid amount" });
    }

    const settings = await Settings.findOne().lean();
    const minWithdraw = settings?.resellerWithdrawMin || 10;

    if (amount < minWithdraw) {
      return res.status(400).json({
        message: `Minimum withdraw is $${minWithdraw}`,
      });
    }

    const wallet = await Wallet.findOne({ user: req.user._id });

    if (!wallet || wallet.balance < amount) {
      return res.status(400).json({
        message: "Insufficient balance",
      });
    }

    wallet.balance -= amount;

    wallet.transactions.push({
      type: "Withdrawal",
      amount,
      status: "Completed",
      description: "Reseller withdrawal",
      date: new Date(),
    });

    await wallet.save();

    res.json({
      message: "Withdrawal successful",
      remainingBalance: wallet.balance,
    });

  } catch (error) {
    res.status(500).json({ message: "Withdraw failed" });
  }
};

/* ================================================
   BRANDING
================================================ */

export const updateBranding = async (req, res) => {
  try {
    const user = req.user;
    const { brandName, logo, themeColor } = req.body;

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
      message: "Branding updated",
      brandName: user.brandName,
      logo: user.logo,
      themeColor: user.themeColor,
    });

  } catch {
    res.status(500).json({ message: "Failed" });
  }
};
