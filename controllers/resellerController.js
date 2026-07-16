// controllers/resellerController.js

import User from "../models/User.js";
import Order from "../models/Order.js";
import Settings from "../models/Settings.js";
import Wallet from "../models/Wallet.js";
import { trySettlePlatformResellerFee } from "./resellerActivationResolver.js";

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

const calculateBalance = (transactions) => {
  return transactions.reduce((balance, transaction) => {
    return balance + (transaction.amount || 0);
  }, 0);
};

/* ================================================
   GET ACTIVATION FEE
   - On a CP domain: returns the CP's custom fee + CP's domain
   - On main platform: returns global Settings fee
================================================ */

export const getActivationFee = async (req, res) => {
  try {
    // req.childPanel is set by detectChildPanelDomain middleware
    // when the request comes from a child panel domain
    if (req.childPanel) {
      const cpOwner = req.childPanel;
      const cpDomain =
        cpOwner.childPanelDomain ||
        `${cpOwner.childPanelSlug}.marinepanel.online`;

      return res.json({
        fee: cpOwner.childPanelResellerActivationFee ?? 2,
        platformDomain: cpDomain,
        isChildPanel: true,
        cpOwnerId: cpOwner._id,
      });
    }

    // Main platform
    const settings = await Settings.findOne().lean();
    return res.json({
      fee: settings?.resellerActivationFee || 25,
      platformDomain: settings?.platformDomain || "marinepanel.online",
      isChildPanel: false,
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch fee" });
  }
};

/* ================================================
   ACTIVATE RESELLER
   - On main platform: stamps no childPanelOwner, uses global fee
   - On CP domain: stamps childPanelOwner, uses CP's fee,
     credits fee to CP's wallet, subdomain under CP's domain
   - NEW: On CP activation, the PLATFORM also silently charges the
     CP owner's wallet an anti-abuse fee (separate from the CP's own
     fee above, which is charged to the reseller). The reseller never
     sees or knows about this second fee. If the CP owner's wallet
     can't cover it, the reseller's panel is marked "pending" — they
     are NOT told why, just shown a neutral pause screen. It resolves
     automatically once the CP owner's wallet has enough balance.
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

    // ── Determine if this is a CP activation ──────────────────────────
    const cpOwner = req.childPanel || null;
    const isCP = !!cpOwner;

    let activationFee;
    let platformDomain;

    if (isCP) {
      activationFee = cpOwner.childPanelResellerActivationFee ?? 2;
      platformDomain =
        cpOwner.childPanelDomain ||
        `${cpOwner.childPanelSlug}.marinepanel.online`;
    } else {
      const settings = await Settings.findOne().lean();
      activationFee = settings?.resellerActivationFee || 25;
      platformDomain = settings?.platformDomain || "marinepanel.online";
    }

    // ── Wallet check ──────────────────────────────────────────────────
    const wallet = await Wallet.findOne({ user: user._id });
    if (!wallet) {
      return res.status(404).json({ message: "Wallet not found" });
    }
    if (wallet.balance < activationFee) {
      return res.status(400).json({
        message: `You need $${activationFee} to activate reseller`,
      });
    }

    // ── Build domain ──────────────────────────────────────────────────
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

      // On a CP domain, prevent custom domains that point elsewhere
      // (they must still be unique globally)
      const cleanDomain = normalizeDomain(customDomain);

      const exists = await User.findOne({ resellerDomain: cleanDomain });
      if (exists) {
        return res.status(400).json({ message: "Domain already in use" });
      }

      finalDomain = cleanDomain;
    }

    // ── Activate ──────────────────────────────────────────────────────
    user.isReseller = true;
    user.brandName = brandName;
    user.brandSlug = slug;
    user.resellerDomain = finalDomain;
    user.themeColor = "#16a34a";
    user.resellerActivatedAt = new Date();

    // Stamp the child panel owner — this is the key field that scopes
    // this reseller to the CP and appears in all CP owner queries
    if (isCP) {
      user.childPanelOwner = cpOwner._id;
    }

    // ── Deduct fee from reseller's wallet ─────────────────────────────
    wallet.transactions.push({
      type: "RPA Fee",
      amount: -Number(activationFee),
      status: "Completed",
      note: isCP
        ? `Reseller activation fee — ${cpOwner.childPanelBrandName || "Child Panel"}`
        : "Reseller activation fee",
      reference: `RSP-${user._id}`,
      createdAt: new Date(),
    });
    wallet.balance = calculateBalance(wallet.transactions);

    await Promise.all([wallet.save(), user.save()]);
    await User.findByIdAndUpdate(user._id, { balance: wallet.balance });

    

    // ── NEW: Platform anti-abuse fee, silently charged to CP owner ────
    // This is SEPARATE from the CP's own fee above. The reseller's own
    // fee has already been deducted and credited at this point — this
    // block only ever touches the CP owner's wallet, never the reseller's.
    // If it can't be covered right now, `pending` is returned to the
    // frontend so it can route to the neutral "pause" screen instead of
    // the dashboard. The reseller is still told activation succeeded.
    let pending = false;
    if (isCP) {
      const settled = await trySettlePlatformResellerFee({
        cpOwnerId: cpOwner._id,
        resellerUser: user,
        cpFeeCharged: activationFee,
        io: req.app.get("io"),
      });
      pending = !settled;
    }

     // ── Refresh CORS allowlist so new domain is unblocked immediately ──
    try {
      const { refreshResellerDomains } = await import("../app.js");
      await refreshResellerDomains();
    } catch (e) {
      console.error("Failed to refresh reseller domains after activation:", e.message);
    }

    res.json({
      message: "Reseller activated successfully",
      domain: finalDomain,
      remainingBalance: wallet.balance,
      pending, // frontend routes to /reseller/pending when true, /reseller/dashboard otherwise
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Activation failed" });
  }
};
/* ================================================
   DASHBOARD (unchanged)
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
   USERS (unchanged)
================================================ */

export const getResellerUsers = async (req, res) => {
  try {
    const users = await User.find({ resellerOwner: req.user._id })
      .select("-password")
      .lean();
    res.json(users);
  } catch {
    res.status(500).json({ message: "Failed" });
  }
};

/* ================================================
   ORDERS (unchanged)
================================================ */

export const getResellerOrders = async (req, res) => {
  try {
    const orders = await Order.find({ resellerOwner: req.user._id })
      .populate("userId", "email phone")
      .sort({ createdAt: -1 })
      .lean();

    const formatted = orders.map((o) => ({
      ...o,
      resellerCommission:
        o.status === "completed" && o.earningsCredited
          ? o.resellerCommission
          : 0,
    }));

    res.json(formatted);
  } catch (err) {
    console.error("RESELLER ORDERS ERROR:", err);
    res.status(500).json({ message: "Failed" });
  }
};

/* ================================================
   WITHDRAW (unchanged)
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
      return res.status(400).json({ message: "Insufficient balance" });
    }

    wallet.transactions.push({
      type: "Withdrawal",
      amount: -Number(amount),
      status: "Completed",
      note: "Reseller withdrawal",
      createdAt: new Date(),
    });
    wallet.balance = calculateBalance(wallet.transactions);
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
   SWITCH DOMAIN (unchanged)
================================================ */

export const switchResellerDomain = async (req, res) => {
  try {
    const userId = req.user._id;
    const { domainType, customDomain } = req.body;

    if (!["custom", "subdomain"].includes(domainType)) {
      return res.status(400).json({ message: "Invalid domain type" });
    }

    const user = await User.findById(userId);
    if (!user || !user.isReseller) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const settings = await Settings.findOne().lean();
    const platformDomain = settings?.platformDomain || "marinepanel.online";

    let finalDomain = "";

    if (domainType === "subdomain") {
      if (!user.brandSlug) {
        return res.status(400).json({ message: "Brand slug missing" });
      }
      finalDomain = `${user.brandSlug}.${platformDomain}`;
      const exists = await User.findOne({
        resellerDomain: finalDomain,
        _id: { $ne: user._id },
      });
      if (exists) {
        return res.status(400).json({ message: "Subdomain already in use" });
      }
    }

    if (domainType === "custom") {
      if (!customDomain) {
        return res.status(400).json({ message: "Custom domain required" });
      }
      const cleanDomain = normalizeDomain(customDomain);
      const exists = await User.findOne({
        resellerDomain: cleanDomain,
        _id: { $ne: user._id },
      });
      if (exists) {
        return res.status(400).json({ message: "Domain already in use" });
      }
      finalDomain = cleanDomain;
    }

    if (user.resellerDomain === finalDomain) {
      return res.status(400).json({ message: "You are already using this domain" });
    }

    user.domainType = domainType;
    user.resellerDomain = finalDomain;
    await user.save();

    res.json({ message: "Domain switched successfully", domain: finalDomain, domainType });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to switch domain" });
  }
};
