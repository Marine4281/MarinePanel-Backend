// controllers/cpOwnerSettingsController.js

import User from "../models/User.js";
import logCpAdminAction from "../utils/logCpAdminAction.js";
import { resolveChildPanelFee } from "../utils/childPanelBilling.js";

// ======================= GET ALL SETTINGS =======================
export const getCPSettings = async (req, res) => {
  try {
    const user = await User.findById(req.cpOwnerId).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({
      brandName:  user.childPanelBrandName  || "",
      logo:       user.childPanelLogo       || "",
      themeColor: user.childPanelThemeColor || "#1e40af",
      slug:       user.childPanelSlug       || "",
      domain:     user.childPanelDomain     || "",
      supportWhatsapp:        user.childPanelSupportWhatsapp        || "",
      supportTelegram:        user.childPanelSupportTelegram        || "",
      supportWhatsappChannel: user.childPanelSupportWhatsappChannel || "",
      resellerActivationFee: user.childPanelResellerActivationFee ?? 25,
      withdrawMin:           user.childPanelWithdrawMin            ?? 10,
      commissionRate:        user.childPanelCommissionRate         ?? 0,
      paymentMode: user.childPanelPaymentMode || "none",
      serviceMode: user.childPanelServiceMode || "none",
      billingMode:  user.childPanelBillingMode  || "monthly",
      monthlyFee:   user.childPanelMonthlyFee   ?? 0,
      perOrderFee:  user.childPanelPerOrderFee  ?? 0,
      lastBilledAt: user.childPanelLastBilledAt || null,
      nextBilledAt:          user.childPanelNextBilledAt          || null,
      subscriptionSuspended: user.childPanelSubscriptionSuspended ?? false,
      autoDeduct:            user.childPanelAutoDeduct,
      gracePeriodHours:      user.childPanelGracePeriodHours,
      reminderHours:         user.childPanelReminderHours,
      templateId:      user.childPanelTemplateId      || null,
      landingTemplate: user.childPanelLandingTemplate || "default",
    });
  } catch (err) {
    console.error("CP GET SETTINGS ERROR:", err);
    res.status(500).json({ message: "Failed to fetch settings" });
  }
};

// ======================= UPDATE BRANDING =======================
export const updateCPBranding = async (req, res) => {
  try {
    const { brandName, logo, themeColor } = req.body;

    const user = await User.findById(req.cpOwnerId);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (brandName  !== undefined) user.childPanelBrandName  = brandName;
    if (logo       !== undefined) user.childPanelLogo       = logo;
    if (themeColor !== undefined) user.childPanelThemeColor = themeColor;

    await user.save();
    logCpAdminAction({ adminId: req.user._id, adminEmail: req.user.email, childPanelId: user._id, action: "UPDATE_BRANDING", targetType: "Settings", description: "Updated CP branding", ipAddress: req.ip }).catch(() => {});

    res.json({ success: true, message: "Branding updated" });
  } catch (err) {
    console.error("CP UPDATE BRANDING ERROR:", err);
    res.status(500).json({ message: "Failed to update branding" });
  }
};

// ======================= UPDATE SUPPORT LINKS =======================
export const updateCPSupportLinks = async (req, res) => {
  try {
    const { supportWhatsapp, supportTelegram, supportWhatsappChannel } = req.body;

    const user = await User.findById(req.cpOwnerId);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (supportWhatsapp        !== undefined) user.childPanelSupportWhatsapp        = supportWhatsapp;
    if (supportTelegram        !== undefined) user.childPanelSupportTelegram        = supportTelegram;
    if (supportWhatsappChannel !== undefined) user.childPanelSupportWhatsappChannel = supportWhatsappChannel;

    await user.save();
    res.json({ success: true, message: "Support links updated" });
  } catch (err) {
    console.error("CP UPDATE SUPPORT LINKS ERROR:", err);
    res.status(500).json({ message: "Failed to update support links" });
  }
};

// ======================= UPDATE RESELLER FEES =======================
export const updateCPResellerFees = async (req, res) => {
  try {
    const { resellerActivationFee, withdrawMin } = req.body;

    const user = await User.findById(req.cpOwnerId);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (resellerActivationFee !== undefined) {
      const fee = Number(resellerActivationFee);
      if (isNaN(fee) || fee < 0)
        return res.status(400).json({ message: "Invalid activation fee" });
      user.childPanelResellerActivationFee = fee;
    }

    if (withdrawMin !== undefined) {
      const min = Number(withdrawMin);
      if (isNaN(min) || min < 0)
        return res.status(400).json({ message: "Invalid minimum withdrawal" });
      user.childPanelWithdrawMin = min;
    }

    await user.save();
    res.json({
      success: true,
      message: "Reseller fees updated",
      resellerActivationFee: user.childPanelResellerActivationFee,
      withdrawMin:           user.childPanelWithdrawMin,
    });
  } catch (err) {
    console.error("CP UPDATE RESELLER FEES ERROR:", err);
    res.status(500).json({ message: "Failed to update reseller fees" });
  }
};

// ======================= UPDATE PAYMENT MODE =======================
export const updateCPPaymentMode = async (req, res) => {
  try {
    const { paymentMode } = req.body;

    if (!["platform", "own", "none"].includes(paymentMode))
      return res.status(400).json({ message: "Invalid payment mode" });

    const user = await User.findById(req.cpOwnerId);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.childPanelPaymentMode = paymentMode;
    await user.save();
    logCpAdminAction({ adminId: req.user._id, adminEmail: req.user.email, childPanelId: user._id, action: "UPDATE_PAYMENT_MODE", targetType: "Settings", description: "Updated CP payment mode", ipAddress: req.ip }).catch(() => {});

    res.json({ success: true, message: "Payment mode updated", paymentMode: user.childPanelPaymentMode });
  } catch (err) {
    console.error("CP UPDATE PAYMENT MODE ERROR:", err);
    res.status(500).json({ message: "Failed to update payment mode" });
  }
};

// ======================= UPDATE SERVICE MODE =======================
export const updateCPServiceMode = async (req, res) => {
  try {
    const { serviceMode } = req.body;

    if (!["platform", "own", "both", "none"].includes(serviceMode))
      return res.status(400).json({ message: "Invalid service mode" });

    const user = await User.findById(req.cpOwnerId);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.childPanelServiceMode = serviceMode;
    await user.save();
    res.json({ success: true, message: "Service mode updated", serviceMode: user.childPanelServiceMode });
  } catch (err) {
    console.error("CP UPDATE SERVICE MODE ERROR:", err);
    res.status(500).json({ message: "Failed to update service mode" });
  }
};

// ======================= UPDATE DOMAIN =======================
export const updateCPDomain = async (req, res) => {
  try {
    const { customDomain } = req.body;

    if (!customDomain)
      return res.status(400).json({ message: "Domain is required" });

    const cleanDomain = customDomain
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split("/")[0]
      .trim();

    const user = await User.findById(req.cpOwnerId);
    if (!user || !user.isChildPanel)
      return res.status(404).json({ message: "Child panel not found" });

    const exists = await User.findOne({
      childPanelDomain: cleanDomain,
      _id: { $ne: user._id },
    });
    if (exists)
      return res.status(400).json({ message: "Domain already in use" });

    user.childPanelDomain = cleanDomain;
    await user.save();
    logCpAdminAction({ adminId: req.user._id, adminEmail: req.user.email, childPanelId: user._id, action: "UPDATE_DOMAIN", targetType: "Settings", description: `Updated CP domain to ${cleanDomain}`, ipAddress: req.ip }).catch(() => {});

    res.json({ success: true, message: "Domain updated", domain: cleanDomain });
  } catch (err) {
    console.error("CP UPDATE DOMAIN ERROR:", err);
    res.status(500).json({ message: "Failed to update domain" });
  }
};

// ======================= UPDATE TEMPLATE =======================
export const updateCPTemplate = async (req, res) => {
  try {
    const { templateId } = req.body;

    const VALID = ["aurora", "pulse", "neon", "tide"];
    if (templateId !== null && templateId !== undefined && !VALID.includes(templateId))
      return res.status(400).json({ message: `Invalid template. Must be one of: ${VALID.join(", ")} or null` });

    const user = await User.findById(req.cpOwnerId);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.childPanelTemplateId = templateId ?? null;
    await user.save();
    res.json({ success: true, message: templateId ? "Template updated" : "Template removed", templateId: user.childPanelTemplateId });
  } catch (err) {
    console.error("CP UPDATE TEMPLATE ERROR:", err);
    res.status(500).json({ message: "Failed to update template" });
  }
};

// ======================= UPDATE LANDING TEMPLATE =======================
export const updateCPLandingTemplate = async (req, res) => {
  try {
    const { landingTemplate } = req.body;
    const VALID = ["default", "dark-pro", "minimal", "vibrant", "sunrise", "bold", "neon"];
    if (!VALID.includes(landingTemplate))
      return res.status(400).json({ message: `Invalid template. Must be one of: ${VALID.join(", ")}` });

    const user = await User.findById(req.cpOwnerId);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.childPanelLandingTemplate = landingTemplate;
    await user.save();
    logCpAdminAction({ adminId: req.user._id, adminEmail: req.user.email, childPanelId: user._id, action: "UPDATE_LANDING_TEMPLATE", targetType: "Settings", description: `Landing template set to: ${landingTemplate}`, ipAddress: req.ip }).catch(() => {});

    res.json({ success: true, landingTemplate: user.childPanelLandingTemplate });
  } catch (err) {
    console.error("CP UPDATE LANDING TEMPLATE ERROR:", err);
    res.status(500).json({ message: "Failed to update landing template" });
  }
};

// ======================= UPDATE AUTO-DEDUCT =======================
export const updateCPAutoDeduct = async (req, res) => {
  try {
    const { autoDeduct } = req.body;
    if (typeof autoDeduct !== "boolean")
      return res.status(400).json({ message: "autoDeduct must be true or false" });

    const user = await User.findById(req.cpOwnerId);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.childPanelAutoDeduct = autoDeduct;
    await user.save();
    res.json({ success: true, message: `Auto-deduct ${autoDeduct ? "enabled" : "disabled"}`, autoDeduct });
  } catch (err) {
    console.error("CP UPDATE AUTO-DEDUCT ERROR:", err);
    res.status(500).json({ message: "Failed to update auto-deduct" });
  }
};

// ======================= PAY BILLING FEE =======================
export const payBillingFee = async (req, res) => {
  try {
    const user = await User.findById(req.cpOwnerId);
    if (!user || !user.isChildPanel)
      return res.status(404).json({ message: "Child panel not found" });

    const now          = new Date();
    const nextBilledAt = user.childPanelNextBilledAt ? new Date(user.childPanelNextBilledAt) : null;

    if (!nextBilledAt)
      return res.status(400).json({ message: "No billing date set" });

    const settings = await Settings.findOne().lean();
    const fee      = resolveChildPanelFee(user, settings);

    if (fee <= 0)
      return res.status(400).json({ message: "No fee due" });

    let wallet = await Wallet.findOne({ user: user._id });
    if (!wallet) wallet = await Wallet.create({ user: user._id, balance: 0, transactions: [] });

    if (wallet.balance < fee) {
      return res.status(400).json({
        message: `Insufficient wallet balance. You need $${fee.toFixed(2)} but have $${wallet.balance.toFixed(2)}.`,
        fee,
        balance: wallet.balance,
      });
    }

    const effectiveIntervalDays =
      user.childPanelBillingIntervalDays ??
      Number(settings?.childPanelBillingIntervalDays ?? 30);

    wallet.transactions.push({
      type:      "Admin Adjustment",
      amount:    -Number(fee),
      status:    "Completed",
      note:      "Child panel subscription fee — paid by owner",
      createdAt: new Date(),
    });
    wallet.balance = wallet.transactions
      .filter((t) => t.status === "Completed")
      .reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
    await wallet.save();
    await User.findByIdAndUpdate(user._id, { balance: wallet.balance });

    user.childPanelLastBilledAt          = now;
    user.childPanelNextBilledAt          = new Date(now.getTime() + effectiveIntervalDays * 24 * 60 * 60 * 1000);
    user.childPanelOrdersThisCycle       = 0;
    user.childPanelSubscriptionSuspended = false;
    user.childPanelIsActive              = true;
    user.childPanelSuspendReason         = null;
    await user.save();

    res.json({
      success:      true,
      message:      `$${fee.toFixed(2)} deducted. Next billing: ${user.childPanelNextBilledAt}`,
      fee,
      newBalance:   wallet.balance,
      nextBilledAt: user.childPanelNextBilledAt,
    });
  } catch (err) {
    console.error("CP PAY FEE ERROR:", err);
    res.status(500).json({ message: "Failed to pay billing fee" });
  }
};
