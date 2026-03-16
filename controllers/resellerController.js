// controllers/resellerController.js

import User from "../models/User.js";
import Order from "../models/Order.js";
import Settings from "../models/Settings.js";
import Wallet from "../models/Wallet.js";

/*
--------------------------------
Helper: Generate Safe Slug
--------------------------------
*/
const generateSlug = (brandName) => {
  return brandName
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9]/g, "");
};

/*
--------------------------------
Helper: Normalize Domain
--------------------------------
*/
const normalizeDomain = (domain) => {
  return domain
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .trim();
};

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
      return res.status(400).json({
        message: "Brand already taken",
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.isReseller) {
      return res.status(400).json({
        message: "Reseller already activated",
      });
    }

    /*
    --------------------------------
    Load Settings
    --------------------------------
    */

    const settings = await Settings.findOne().lean();

    const activationFee = settings?.resellerActivationFee || 25;
    const platformDomain = settings?.platformDomain || "marinepanel.online";

    /*
    --------------------------------
    Wallet
    --------------------------------
    */

    const wallet = await Wallet.findOne({ user: user._id });

    if (!wallet) {
      return res.status(404).json({ message: "Wallet not found" });
    }

    if (wallet.balance < activationFee) {
      return res.status(400).json({
        message: `You need $${activationFee} in your wallet to activate reseller`,
      });
    }

    let finalDomain = "";

    /*
    --------------------------------
    Subdomain
    --------------------------------
    */

    if (domainType === "subdomain") {

      finalDomain = `${slug}.${platformDomain}`;

      const existingDomain = await User.findOne({
        resellerDomain: finalDomain,
      });

      if (existingDomain) {
        return res.status(400).json({
          message: "Subdomain already in use",
        });
      }
    }

    /*
    --------------------------------
    Custom Domain
    --------------------------------
    */

    if (domainType === "custom") {

      if (!customDomain) {
        return res.status(400).json({
          message: "Custom domain required",
        });
      }

      const cleanDomain = normalizeDomain(customDomain);

      const existingDomain = await User.findOne({
        resellerDomain: cleanDomain,
      });

      if (existingDomain) {
        return res.status(400).json({
          message: "Domain already in use",
        });
      }

      finalDomain = cleanDomain;
    }

    /*
    --------------------------------
    Activate Reseller
    --------------------------------
    */

    user.isReseller = true;
    user.brandName = brandName;
    user.brandSlug = slug;
    user.resellerDomain = finalDomain;
    user.themeColor = "#16a34a"; // default green
    user.resellerActivatedAt = new Date();
    user.resellerWallet = 0;

    /*
    --------------------------------
    Deduct Activation Fee
    --------------------------------
    */

    wallet.balance -= activationFee;

    wallet.transactions.push({
      type: "Withdrawal",
      amount: -activationFee,
      status: "Completed",
      description: "Reseller panel activation fee",
      date: new Date(),
    });

    await wallet.save();
    await user.save();

    res.json({
      message: "Reseller activated successfully",
      domain: finalDomain,
      activationFee,
      remainingBalance: wallet.balance,
    });

  } catch (error) {

    console.error("Activate reseller error:", error);

    res.status(500).json({
      message: "Failed to activate reseller",
    });

  }
};

/*
--------------------------------
Get Activation Fee
--------------------------------
*/
export const getActivationFee = async (req, res) => {
  try {

    const settings = await Settings.findOne().lean();

    res.json({
      fee: settings?.resellerActivationFee || 25,
      platformDomain: settings?.platformDomain || "marinepanel.online",
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      message: "Failed to fetch activation fee",
    });

  }
};

/*
--------------------------------
Reseller Dashboard
--------------------------------
*/
export const getResellerDashboard = async (req, res) => {
  try {

    const resellerId = req.reseller?._id || req.user._id;

    const usersCount = await User.countDocuments({
      resellerOwner: resellerId,
    });

    const ordersCount = await Order.countDocuments({
      resellerOwner: resellerId,
    });

    const revenueAgg = await Order.aggregate([
      { $match: { resellerOwner: resellerId } },
      {
        $group: {
          _id: null,
          total: { $sum: "$resellerCommission" },
        },
      },
    ]);

    const revenue = revenueAgg[0]?.total || 0;

    const user = await User.findById(resellerId).lean();

    const wallet = await Wallet.findOne({
      user: resellerId,
    }).lean();

    res.json({
      users: usersCount,
      orders: ordersCount,
      revenue,
      wallet: wallet?.balance || 0,
      domain: user?.resellerDomain,
      brandName: user?.brandName,
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      message: "Failed to load dashboard",
    });

  }
};

/*
--------------------------------
Get Reseller Users
--------------------------------
*/
export const getResellerUsers = async (req, res) => {
  try {

    const users = await User.find({
      resellerOwner: req.user._id,
    })
      .select("-password")
      .sort({ createdAt: -1 })
      .lean();

    res.json(users);

  } catch (error) {

    console.error(error);

    res.status(500).json({
      message: "Failed to fetch reseller users",
    });

  }
};

/*
--------------------------------
Get Reseller Orders
--------------------------------
*/
export const getResellerOrders = async (req, res) => {
  try {

    const orders = await Order.find({
      resellerOwner: req.user._id,
    })
      .sort({ createdAt: -1 })
      .lean();

    res.json(orders);

  } catch (error) {

    console.error(error);

    res.status(500).json({
      message: "Failed to fetch reseller orders",
    });

  }
};

/*
--------------------------------
Withdraw Earnings
--------------------------------
*/
export const withdrawResellerFunds = async (req, res) => {
  try {

    const { amount } = req.body;

    const settings = await Settings.findOne().lean();

    const minWithdraw = settings?.resellerWithdrawMin || 10;

    const user = await User.findById(req.user._id);

    const wallet = await Wallet.findOne({ user: user._id });

    if (amount < minWithdraw) {
      return res.status(400).json({
        message: `Minimum withdraw is $${minWithdraw}`,
      });
    }

    if (amount > (user.resellerWallet || 0)) {
      return res.status(400).json({
        message: "Insufficient balance",
      });
    }

    user.resellerWallet -= amount;

    await user.save();

    if (wallet) {

      wallet.transactions.push({
        type: "Withdrawal",
        amount,
        status: "Completed",
        description: "Reseller funds withdrawal",
        date: new Date(),
      });

      wallet.balance -= amount;

      await wallet.save();

    }

    res.json({
      message: "Withdraw request submitted",
      remainingBalance: user.resellerWallet,
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      message: "Withdraw failed",
    });

  }
};

/*
--------------------------------
Update Branding
--------------------------------
*/
export const updateBranding = async (req, res) => {
  try {

    const user = req.user;

    const { brandName, logo, themeColor } = req.body;

    if (brandName !== undefined) {

      const newSlug = generateSlug(brandName);

      const existing = await User.findOne({
        brandSlug: newSlug,
        _id: { $ne: user._id },
      });

      if (existing) {
        return res.status(400).json({
          message: "Brand name already in use",
        });
      }

      user.brandName = brandName;
      user.brandSlug = newSlug;
    }

    if (logo !== undefined) {
      user.logo = logo;
    }

    if (themeColor !== undefined) {
      user.themeColor = themeColor;
    }

    await user.save();

    res.json({
      message: "Branding updated successfully",
      brandName: user.brandName,
      logo: user.logo,
      themeColor: user.themeColor,
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      message: "Branding update failed",
    });

  }
};
