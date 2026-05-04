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
   RESERVED SLUGS
   These can never be used as child panel slugs.
   They either conflict with platform routes,
   DNS records we own, or common abuse targets.
================================================ */
const RESERVED_SLUGS = new Set([
  "api", "admin", "www", "mail", "app", "panel", "support",
  "marinepanel", "marine", "help", "status", "blog", "cdn",
  "assets", "static", "media", "auth", "login", "register",
  "dashboard", "billing", "reseller", "child", "cp", "root",
  "system", "dev", "test", "staging", "demo", "sandbox",
]);

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

    // ── 1. Basic validation ──────────────────────────
    if (!brandName || !brandName.trim()) {
      return res.status(400).json({ message: "Brand name is required" });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.isChildPanel) {
      return res.status(400).json({ message: "Already a child panel owner" });
    }

    // ── 2. Build & validate slug ─────────────────────
    const finalSlug = (slug || brandName)
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "")
      .replace(/[^a-z0-9]/g, "");

    if (!finalSlug || finalSlug.length < 3) {
      return res.status(400).json({
        message: "Slug must be at least 3 characters (letters and numbers only)",
      });
    }

    if (finalSlug.length > 30) {
      return res.status(400).json({
        message: "Slug must be 30 characters or fewer",
      });
    }

    // ── 3. Reserved slug check (SEC-1) ───────────────
    if (RESERVED_SLUGS.has(finalSlug)) {
      return res.status(400).json({
        message: `"${finalSlug}" is a reserved name and cannot be used. Please choose another.`,
      });
    }

    // ── 4. Uniqueness: check against BOTH resellers
    //       and existing child panels (SEC-1) ─────────
    const slugConflict = await User.findOne({
      $or: [
        { isReseller: true, brandSlug: finalSlug },
        { isChildPanel: true, childPanelSlug: finalSlug },
      ],
    }).lean();

    if (slugConflict) {
      return res.status(400).json({
        message: "This brand slug is already taken. Please choose a different one.",
      });
    }

    // ── 5. Custom domain validation ──────────────────
    let cleanDomain = null;

    if (customDomain && customDomain.trim()) {
      cleanDomain = normalizeDomain(customDomain.trim());

      // Must not be the main platform domain or any subdomain of it
      const PLATFORM_DOMAIN = "marinepanel.online";
      if (
        cleanDomain === PLATFORM_DOMAIN ||
        cleanDomain.endsWith(`.${PLATFORM_DOMAIN}`)
      ) {
        return res.status(400).json({
          message: "You cannot use the marinepanel.online domain as your custom domain. Point your own domain instead.",
        });
      }

      // Must look like a real domain (basic format check)
      const domainPattern = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z]{2,})+$/;
      if (!domainPattern.test(cleanDomain)) {
        return res.status(400).json({
          message: "Invalid custom domain format. Example: mypanel.com",
        });
      }

      // Must not be already registered to another child panel or reseller
      const domainConflict = await User.findOne({
        $or: [
          { isChildPanel: true, childPanelDomain: cleanDomain },
          { isReseller: true, resellerDomain: cleanDomain },
        ],
      }).lean();

      if (domainConflict) {
        return res.status(400).json({
          message: "This domain is already in use on this platform.",
        });
      }
    }

    // ── 6. Load settings & resolve fees ─────────────
    const settings = await Settings.findOne().lean();

    const offerActive =
      settings?.childPanelOfferActive &&
      (!settings?.childPanelOfferExpiresAt ||
        new Date(settings.childPanelOfferExpiresAt) > new Date());

    const activationFee = offerActive
      ? Number(settings.childPanelOfferActivationFee ?? 2)
      : Number(settings?.childPanelActivationFee ?? 100);

    const monthlyFee = offerActive
      ? Number(settings.childPanelOfferMonthlyFee ?? 0)
      : Number(settings?.childPanelMonthlyFee ?? 20);

    const billingMode = settings?.childPanelBillingMode || "monthly";
    const perOrderFee = Number(settings?.childPanelPerOrderFee ?? 0);
    const withdrawMin = Number(settings?.childPanelWithdrawMin ?? 10);
    const platformDomain = settings?.platformDomain || "marinepanel.online";

    // ── 7. Wallet balance check ──────────────────────
    const wallet = await Wallet.findOne({ user: userId });
    if (!wallet) return res.status(404).json({ message: "Wallet not found" });

    if (wallet.balance < activationFee) {
      return res.status(400).json({
        message: `Insufficient balance. You need $${activationFee.toFixed(2)} to activate a child panel. Your balance: $${wallet.balance.toFixed(2)}.`,
      });
    }

    // ── 8. Deduct activation fee ─────────────────────
    wallet.transactions.push({
      type: "CP Activation Fee",
      amount: -activationFee,
      status: "Completed",
      note: `Child panel activation fee${offerActive ? " (offer price)" : ""}`,
      reference: `CP-ACT-${userId}-${Date.now()}`,
      createdAt: new Date(),
    });

    wallet.balance = calculateBalance(wallet.transactions);
    await wallet.save();

    // ── 9. Stamp child panel fields on user ──────────
    user.isChildPanel = true;
    user.childPanelEnabled = true;          // backward-compat field
    user.childPanelIsActive = true;
    user.childPanelActivatedAt = new Date();
    user.childPanelBrandName = brandName.trim();
    user.childPanelSlug = finalSlug;
    user.childPanelDomain = cleanDomain;    // null if no custom domain given

    // Billing — inherited from admin settings at time of activation
    user.childPanelBillingMode = billingMode;
    user.childPanelMonthlyFee = monthlyFee;
    user.childPanelPerOrderFee = perOrderFee;
    user.childPanelLastBilledAt = new Date();

    // Defaults the CP owner can change later from their settings page
    user.childPanelWithdrawMin = withdrawMin;
    user.childPanelResellerActivationFee = 25;
    user.childPanelCommissionRate = 0;
    user.childPanelPaymentMode = "none";
    user.childPanelServiceMode = "none";

    await user.save();

    // ── 10. Keep User.balance in sync ────────────────
    await User.findByIdAndUpdate(userId, { balance: wallet.balance });

    // ── 11. Refresh CORS domain cache if custom domain ──
    if (cleanDomain) {
      try {
        const { refreshChildDomains } = await import("../app.js");
        await refreshChildDomains();
      } catch (cacheErr) {
        // Non-fatal — CORS cache will sync on next restart
        console.warn("CORS cache refresh skipped:", cacheErr.message);
      }
    }

    // ── 12. Respond ──────────────────────────────────
    const panelUrl = cleanDomain
      ? `https://${cleanDomain}`
      : `https://${finalSlug}.${platformDomain}`;

    res.status(201).json({
      message: "Child panel activated successfully",
      slug: finalSlug,
      domain: cleanDomain || `${finalSlug}.${platformDomain}`,
      panelUrl,
      remainingBalance: wallet.balance,
      billingMode,
      monthlyFee,
      offerApplied: offerActive,
    });

  } catch (error) {
    console.error("CHILD PANEL ACTIVATION ERROR:", error);

    // Surface Mongoose duplicate-key errors cleanly
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0] || "field";
      return res.status(400).json({
        message: `That ${field} is already taken. Please try a different one.`,
      });
    }

    res.status(500).json({ message: "Activation failed. Please try again." });
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
export const getChildPanelBranding = async (req, res) => {
  try {
    // req.childPanel is set by detectChildPanelDomain middleware
    if (!req.childPanel) {
      return res.status(404).json({ message: "Not a child panel domain" });
    }

    const cp = req.childPanel;

    res.json({
      brandName:  cp.childPanelBrandName  || "Panel",
      logo:       cp.childPanelLogo       || null,
      themeColor: cp.childPanelThemeColor || "#1e40af",
      slug:       cp.childPanelSlug       || null,
      domain:     cp.childPanelDomain     || null,
      // ── ADDED ──────────────────────────────────────────────
      // TemplateRouter reads this on every page load to decide
      // which template to render. null = use default pages.
      templateId: cp.childPanelTemplateId || null,
      // ───────────────────────────────────────────────────────
      support: {
        whatsapp:        cp.childPanelSupportWhatsapp        || null,
        telegram:        cp.childPanelSupportTelegram        || null,
        whatsappChannel: cp.childPanelSupportWhatsappChannel || null,
      },
    });
  } catch (err) {
    console.error("GET CP BRANDING ERROR:", err);
    res.status(500).json({ message: "Server error" });
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

// GET /child-panel/branding
// Public — called by frontend to get branding for current domain
export const getChildPanelBranding = async (req, res) => {
  try {
    // req.childPanel is set by detectChildPanelDomain middleware
    if (!req.childPanel) {
      return res.status(404).json({ message: "Not a child panel domain" });
    }

    const cp = req.childPanel;

    res.json({
      brandName: cp.childPanelBrandName || "Panel",
      logo: cp.childPanelLogo || null,
      themeColor: cp.childPanelThemeColor || "#1e40af",
      slug: cp.childPanelSlug || null,
      domain: cp.childPanelDomain || null,
      support: {
        whatsapp: cp.childPanelSupportWhatsapp || null,
        telegram: cp.childPanelSupportTelegram || null,
        whatsappChannel: cp.childPanelSupportWhatsappChannel || null,
      },
    });
  } catch (err) {
    console.error("GET CP BRANDING ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};
