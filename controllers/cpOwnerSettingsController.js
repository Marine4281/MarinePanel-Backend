// controllers/cpOwnerSettingsController.js
//
// Child panel owner managing their own panel settings.
// All settings live on the child panel owner's User document.
// There is no shared Settings collection for child panels —
// each child panel owner is fully independent.
//
// Covers:
//   - Commission rate they earn per order (set by main admin, read-only here)
//   - Reseller activation fee they charge their own resellers
//   - Minimum withdrawal from their panel wallet
//   - Support links (WhatsApp, Telegram, WhatsApp channel)
//   - Payment mode (platform gateway vs own gateway)
//   - Service mode (platform services vs own providers vs both)
//   - Branding (brand name, logo, theme color)

import User from "../models/User.js";

// ======================= GET ALL SETTINGS =======================
// Returns all configurable settings for this child panel owner
// in one response so the frontend can populate all tabs at once

export const getCPSettings = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({
      // Branding
      brandName: user.childPanelBrandName || "",
      logo: user.childPanelLogo || "",
      themeColor: user.childPanelThemeColor || "#1e40af",
      slug: user.childPanelSlug || "",
      domain: user.childPanelDomain || "",

      // Support
      supportWhatsapp: user.childPanelSupportWhatsapp || "",
      supportTelegram: user.childPanelSupportTelegram || "",
      supportWhatsappChannel: user.childPanelSupportWhatsappChannel || "",

      // Reseller fees (set by child panel owner for their resellers)
      resellerActivationFee: user.childPanelResellerActivationFee ?? 25,
      withdrawMin: user.childPanelWithdrawMin ?? 10,

      // Commission rate (set by main admin — child panel owner cannot change this)
      commissionRate: user.childPanelCommissionRate ?? 0,

      // Payment & service modes
      paymentMode: user.childPanelPaymentMode || "none",
      serviceMode: user.childPanelServiceMode || "none",

      // Billing info (read-only — set by main admin)
      billingMode: user.childPanelBillingMode || "monthly",
      monthlyFee: user.childPanelMonthlyFee ?? 0,
      perOrderFee: user.childPanelPerOrderFee ?? 0,
      lastBilledAt: user.childPanelLastBilledAt || null,

      // Template
      templateId: user.childPanelTemplateId || null,
    });
  } catch (err) {
    console.error("CP GET SETTINGS ERROR:", err);
    res.status(500).json({ message: "Failed to fetch settings" });
  }
};

// ======================= UPDATE BRANDING =======================

export const updateCPBranding = async (req, res) => {
  try {
    const {
      brandName,
      logo,
      themeColor,
    } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (brandName !== undefined) user.childPanelBrandName = brandName;
    if (logo !== undefined) user.childPanelLogo = logo;
    if (themeColor !== undefined) user.childPanelThemeColor = themeColor;

    await user.save();

    res.json({ success: true, message: "Branding updated" });
  } catch (err) {
    console.error("CP UPDATE BRANDING ERROR:", err);
    res.status(500).json({ message: "Failed to update branding" });
  }
};

// ======================= UPDATE SUPPORT LINKS =======================

export const updateCPSupportLinks = async (req, res) => {
  try {
    const {
      supportWhatsapp,
      supportTelegram,
      supportWhatsappChannel,
    } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (supportWhatsapp !== undefined)
      user.childPanelSupportWhatsapp = supportWhatsapp;
    if (supportTelegram !== undefined)
      user.childPanelSupportTelegram = supportTelegram;
    if (supportWhatsappChannel !== undefined)
      user.childPanelSupportWhatsappChannel = supportWhatsappChannel;

    await user.save();

    res.json({ success: true, message: "Support links updated" });
  } catch (err) {
    console.error("CP UPDATE SUPPORT LINKS ERROR:", err);
    res.status(500).json({ message: "Failed to update support links" });
  }
};

// ======================= UPDATE RESELLER FEES =======================
// Child panel owner sets the fees they charge their own resellers

export const updateCPResellerFees = async (req, res) => {
  try {
    const { resellerActivationFee, withdrawMin } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (resellerActivationFee !== undefined) {
      const fee = Number(resellerActivationFee);
      if (isNaN(fee) || fee < 0) {
        return res.status(400).json({ message: "Invalid activation fee" });
      }
      user.childPanelResellerActivationFee = fee;
    }

    if (withdrawMin !== undefined) {
      const min = Number(withdrawMin);
      if (isNaN(min) || min < 0) {
        return res.status(400).json({ message: "Invalid minimum withdrawal" });
      }
      user.childPanelWithdrawMin = min;
    }

    await user.save();

    res.json({
      success: true,
      message: "Reseller fees updated",
      resellerActivationFee: user.childPanelResellerActivationFee,
      withdrawMin: user.childPanelWithdrawMin,
    });
  } catch (err) {
    console.error("CP UPDATE RESELLER FEES ERROR:", err);
    res.status(500).json({ message: "Failed to update reseller fees" });
  }
};

// ======================= UPDATE PAYMENT MODE =======================
// Child panel owner connects or switches their payment gateway
// 'platform' = uses main platform Paystack (deposits go to main admin)
// 'own'      = child panel owner uses their own gateway keys
// 'none'     = not connected yet

export const updateCPPaymentMode = async (req, res) => {
  try {
    const { paymentMode } = req.body;

    if (!["platform", "own", "none"].includes(paymentMode)) {
      return res.status(400).json({ message: "Invalid payment mode" });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.childPanelPaymentMode = paymentMode;
    await user.save();

    res.json({
      success: true,
      message: "Payment mode updated",
      paymentMode: user.childPanelPaymentMode,
    });
  } catch (err) {
    console.error("CP UPDATE PAYMENT MODE ERROR:", err);
    res.status(500).json({ message: "Failed to update payment mode" });
  }
};

// ======================= UPDATE SERVICE MODE =======================
// 'platform' = uses main platform services as provider
// 'own'      = uses their own provider API keys
// 'both'     = mix of platform + own providers
// 'none'     = not connected yet

export const updateCPServiceMode = async (req, res) => {
  try {
    const { serviceMode } = req.body;

    if (!["platform", "own", "both", "none"].includes(serviceMode)) {
      return res.status(400).json({ message: "Invalid service mode" });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.childPanelServiceMode = serviceMode;
    await user.save();

    res.json({
      success: true,
      message: "Service mode updated",
      serviceMode: user.childPanelServiceMode,
    });
  } catch (err) {
    console.error("CP UPDATE SERVICE MODE ERROR:", err);
    res.status(500).json({ message: "Failed to update service mode" });
  }
};

// ======================= UPDATE DOMAIN =======================
// Child panel owner switches between slug (testing) and
// custom domain (production). Checks uniqueness before saving.

export const updateCPDomain = async (req, res) => {
  try {
    const { customDomain } = req.body;

    if (!customDomain) {
      return res.status(400).json({ message: "Domain is required" });
    }

    const cleanDomain = customDomain
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split("/")[0]
      .trim();

    const user = await User.findById(req.user._id);
    if (!user || !user.isChildPanel) {
      return res.status(404).json({ message: "Child panel not found" });
    }

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
  } catch (err) {
    console.error("CP UPDATE DOMAIN ERROR:", err);
    res.status(500).json({ message: "Failed to update domain" });
  }
};

// ======================= UPDATE TEMPLATE =======================
// Child panel owner selects a UI template for their panel.
// templateId can be a valid string ("aurora", "pulse", "neon", "tide")
// or explicitly null to remove the template and restore default pages.

export const updateCPTemplate = async (req, res) => {
  try {
    const { templateId } = req.body;

    // Allow null (remove template) or a non-empty string
    const VALID = ["aurora", "pulse", "neon", "tide"];
    if (templateId !== null && templateId !== undefined && !VALID.includes(templateId)) {
      return res.status(400).json({
        message: `Invalid template. Must be one of: ${VALID.join(", ")} or null`,
      });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found" });

    // null removes the template (restores default pages)
    user.childPanelTemplateId = templateId ?? null;
    await user.save();

    res.json({
      success: true,
      message: templateId ? "Template updated" : "Template removed",
      templateId: user.childPanelTemplateId,
    });
  } catch (err) {
    console.error("CP UPDATE TEMPLATE ERROR:", err);
    res.status(500).json({ message: "Failed to update template" });
  }
};
