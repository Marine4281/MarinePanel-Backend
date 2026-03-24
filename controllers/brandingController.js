// controllers/brandingController.js
import User from "../models/User.js";

/*
========================================
PUBLIC BRANDING (DOMAIN-BASED)
========================================
*/
export const getPublicBranding = async (req, res) => {
  try {
    // ✅ Only allow ACTIVE reseller branding
    if (
      req.brand &&
      req.brand.isReseller &&
      req.brand.resellerActivatedAt
    ) {
      return res.json({
        brandName: req.brand.brandName || "Reseller Panel",
        logo: req.brand.logo || "",
        themeColor: req.brand.themeColor || "#16a34a",
        domain: req.brand.domain || null,

        // ✅ SUPPORT (ACTIVE ONLY)
        supportWhatsapp: req.brand.supportWhatsapp || "",
        supportTelegram: req.brand.supportTelegram || "",
        supportWhatsappChannel: req.brand.supportWhatsappChannel || "",
      });
    }

    // ✅ Default platform branding
    return res.json({
      brandName: "MarinePanel",
      logo: "",
      themeColor: "#f97316",
      domain: "marinepanel.online",

      // ❌ No support leakage
      supportWhatsapp: "",
      supportTelegram: "",
      supportWhatsappChannel: "",
    });
  } catch (error) {
    console.error("Public Branding error:", error);
    return res.status(500).json({ message: "Branding load failed" });
  }
};

/*
========================================
DASHBOARD BRANDING (USER-BASED)
========================================
*/
export const getDashboardBranding = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const isActiveReseller =
      req.user.isReseller && req.user.resellerActivatedAt;

    // ✅ ACTIVE reseller only
    if (isActiveReseller) {
      return res.json({
        brandName: req.user.brandName || "Reseller Panel",
        logo: req.user.logo || "",
        themeColor: req.user.themeColor || "#16a34a",
        domain: req.user.resellerDomain || null,

        // ✅ SUPPORT
        supportWhatsapp: req.user.supportWhatsapp || "",
        supportTelegram: req.user.supportTelegram || "",
        supportWhatsappChannel: req.user.supportWhatsappChannel || "",
      });
    }

    // ❌ Inactive reseller OR normal user
    return res.json({
      brandName: "MarinePanel",
      logo: "",
      themeColor: "#f97316",
      domain: "marinepanel.online",

      supportWhatsapp: "",
      supportTelegram: "",
      supportWhatsappChannel: "",
    });
  } catch (error) {
    console.error("Dashboard Branding error:", error);
    return res.status(500).json({ message: "Branding load failed" });
  }
};

/*
========================================
UPDATE BRANDING (ACTIVE RESELLER ONLY)
========================================
*/
export const updateBranding = async (req, res) => {
  try {
    const isActiveReseller =
      req.user &&
      req.user.isReseller &&
      req.user.resellerActivatedAt;

    if (!isActiveReseller) {
      return res.status(403).json({
        message: "Activate reseller to update branding",
      });
    }

    const {
      brandName,
      themeColor,
      logo,
      supportWhatsapp,
      supportTelegram,
      supportWhatsappChannel,
    } = req.body;

    const updateData = {};

    // Helper: convert null/undefined to empty string for optional string fields
    const normalizeOptionalString = (value) => {
      if (value === null || value === undefined) return "";
      if (typeof value === "string") return value.trim();
      return String(value).trim();
    };

    // Branding
    if (brandName !== undefined) {
      updateData.brandName = brandName;
    }

    if (themeColor !== undefined) {
      updateData.themeColor = themeColor;
    }

    // Optional fields: always save "" instead of null
    if (logo !== undefined) {
      updateData.logo = normalizeOptionalString(logo);
    }

    if (supportWhatsapp !== undefined) {
      updateData.supportWhatsapp = normalizeOptionalString(supportWhatsapp);
    }

    if (supportTelegram !== undefined) {
      updateData.supportTelegram = normalizeOptionalString(supportTelegram);
    }

    if (supportWhatsappChannel !== undefined) {
      updateData.supportWhatsappChannel =
        normalizeOptionalString(supportWhatsappChannel);
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    Object.keys(updateData).forEach((key) => {
      user[key] = updateData[key];
    });

    await user.save(); // ✅ Runs validators

    return res.json({
      message: "Branding updated successfully",
      branding: {
        brandName: user.brandName,
        themeColor: user.themeColor,
        logo: user.logo || "",
        domain: user.resellerDomain,
        supportWhatsapp: user.supportWhatsapp || "",
        supportTelegram: user.supportTelegram || "",
        supportWhatsappChannel: user.supportWhatsappChannel || "",
      },
    });
  } catch (err) {
    console.error("Update Branding error:", err);

    // ✅ If validation failed, show which field
    if (err.name === "ValidationError") {
      return res.status(400).json({
        message: "Invalid support links",
        errors: err.errors,
      });
    }

    return res.status(500).json({ message: "Failed to update branding" });
  }
};
