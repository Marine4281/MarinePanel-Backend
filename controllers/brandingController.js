// controllers/brandingController.js
import User from "../models/User.js";

/*
========================================
PUBLIC BRANDING (DOMAIN-BASED)
========================================
*/
export const getPublicBranding = async (req, res) => {
  try {
    if (
      req.brand &&
      req.brand.isReseller &&
      req.brand.resellerActivatedAt
    ) {
      return res.json({
        brandName: req.brand.brandName || "Reseller Panel",
        logo: req.brand.logo || "",
        themeColor: req.brand.themeColor || "#16a34a",
        domain: req.brand.resellerDomain || req.brand.domain || null,
        supportWhatsapp: req.brand.supportWhatsapp || "",
        supportTelegram: req.brand.supportTelegram || "",
        supportWhatsappChannel: req.brand.supportWhatsappChannel || "",
      });
    }

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
    console.error("Public Branding error:", error);
    return res.status(500).json({
      message: error.message || "Branding load failed",
    });
  }
};

/*
========================================
DASHBOARD BRANDING (USER-BASED)
========================================
*/
export const getDashboardBranding = async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = await User.findById(req.user._id).lean();

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const isActiveReseller = user.isReseller && user.resellerActivatedAt;

    if (isActiveReseller) {
      return res.json({
        brandName: user.brandName || "Reseller Panel",
        logo: user.logo || "",
        themeColor: user.themeColor || "#16a34a",
        domain: user.resellerDomain || null,
        supportWhatsapp: user.supportWhatsapp || "",
        supportTelegram: user.supportTelegram || "",
        supportWhatsappChannel: user.supportWhatsappChannel || "",
      });
    }

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
    return res.status(500).json({
      message: error.message || "Branding load failed",
    });
  }
};

/*
========================================
UPDATE BRANDING (ACTIVE RESELLER ONLY)
========================================
*/
export const updateBranding = async (req, res) => {
  try {
    // 🔍 Debug incoming auth and body
    console.log("PATCH /branding req.user:", req.user);
    console.log("PATCH /branding req.body:", req.body);

    if (!req.user || !req.user._id) {
      return res.status(401).json({
        message: "Unauthorized: user not found in request",
      });
    }

    // Always fetch fresh user from DB
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const isActiveReseller = user.isReseller && user.resellerActivatedAt;

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
    } = req.body || {};

    const normalizeOptionalString = (value) => {
      if (value === null || value === undefined) return "";
      return String(value).trim();
    };

    // Update only fields that were sent
    if (brandName !== undefined) {
      user.brandName = normalizeOptionalString(brandName);
    }

    if (themeColor !== undefined) {
      user.themeColor = normalizeOptionalString(themeColor);
    }

    if (logo !== undefined) {
      user.logo = normalizeOptionalString(logo);
    }

    if (supportWhatsapp !== undefined) {
      user.supportWhatsapp = normalizeOptionalString(supportWhatsapp);
    }

    if (supportTelegram !== undefined) {
      user.supportTelegram = normalizeOptionalString(supportTelegram);
    }

    if (supportWhatsappChannel !== undefined) {
      user.supportWhatsappChannel = normalizeOptionalString(
        supportWhatsappChannel
      );
    }

    console.log("Saving branding for user:", {
      id: user._id,
      brandName: user.brandName,
      themeColor: user.themeColor,
      logo: user.logo,
      supportWhatsapp: user.supportWhatsapp,
      supportTelegram: user.supportTelegram,
      supportWhatsappChannel: user.supportWhatsappChannel,
      isReseller: user.isReseller,
      resellerActivatedAt: user.resellerActivatedAt,
    });

    await user.save();

    return res.json({
      message: "Branding updated successfully",
      branding: {
        brandName: user.brandName || "",
        logo: user.logo || "",
        themeColor: user.themeColor || "#16a34a",
        domain: user.resellerDomain || null,
        supportWhatsapp: user.supportWhatsapp || "",
        supportTelegram: user.supportTelegram || "",
        supportWhatsappChannel: user.supportWhatsappChannel || "",
      },
    });
  } catch (err) {
    console.error("Update Branding error FULL:", err);
    console.error("Update Branding error name:", err?.name);
    console.error("Update Branding error message:", err?.message);
    console.error("Update Branding stack:", err?.stack);

    if (err?.errors) {
      console.error("Validation errors:", err.errors);
    }

    if (err?.name === "ValidationError") {
      return res.status(400).json({
        message: "Invalid branding fields",
        errors: err.errors,
      });
    }

    return res.status(500).json({
      message: err?.message || "Failed to update branding",
    });
  }
};
