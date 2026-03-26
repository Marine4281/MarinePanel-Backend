// controllers/brandingController.js

import User from "../models/User.js";
import Settings from "../models/Settings.js"; // ✅ NEW

/*
========================================
PUBLIC BRANDING (DOMAIN-BASED)
========================================
*/
export const getPublicBranding = async (req, res) => {
  try {
    /*
    ================================
    1️⃣ RESELLER DOMAIN
    ================================
    */
    if (req.brand) {
      return res.json({
        brandName: req.brand.brandName || "Reseller Panel",
        logo: req.brand.logo || null,
        themeColor: req.brand.themeColor || "#16a34a",
        domain: req.brand.domain || null,

        // ✅ RESELLER SUPPORT ONLY
        supportWhatsapp: req.brand.supportWhatsapp || "",
        supportTelegram: req.brand.supportTelegram || "",
        supportWhatsappChannel:
          req.brand.supportWhatsappChannel || "",
      });
    }

    /*
    ================================
    2️⃣ MAIN PANEL (ADMIN SUPPORT)
    ================================
    */
    const settings = await Settings.findOne();

    return res.json({
      brandName: "MarinePanel",
      logo: null,
      themeColor: "#f97316",
      domain: "marinepanel.online",

      // ✅ ADMIN SUPPORT ONLY (NO FALLBACK)
      supportWhatsapp: settings?.supportWhatsapp || "",
      supportTelegram: settings?.supportTelegram || "",
      supportWhatsappChannel:
        settings?.supportWhatsappChannel || "",
    });

  } catch (error) {
    console.error("Public Branding error:", error);
    res.status(500).json({ message: "Branding load failed" });
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

    /*
    ================================
    1️⃣ RESELLER DASHBOARD
    ================================
    */
    if (req.user.isReseller) {
      return res.json({
        brandName: req.user.brandName || "Reseller Panel",
        logo: req.user.logo || null,
        themeColor: req.user.themeColor || "#16a34a",
        domain: req.user.resellerDomain || null,

        // ✅ RESELLER SUPPORT ONLY
        supportWhatsapp: req.user.supportWhatsapp || "",
        supportTelegram: req.user.supportTelegram || "",
        supportWhatsappChannel:
          req.user.supportWhatsappChannel || "",
      });
    }

    /*
    ================================
    2️⃣ ADMIN DASHBOARD
    ================================
    */
    const settings = await Settings.findOne();

    return res.json({
      brandName: "MarinePanel",
      logo: null,
      themeColor: "#f97316",
      domain: "marinepanel.online",

      // ✅ ADMIN SUPPORT ONLY
      supportWhatsapp: settings?.supportWhatsapp || "",
      supportTelegram: settings?.supportTelegram || "",
      supportWhatsappChannel:
        settings?.supportWhatsappChannel || "",
    });

  } catch (error) {
    console.error("Dashboard Branding error:", error);
    res.status(500).json({ message: "Branding load failed" });
  }
};


/*
========================================
UPDATE BRANDING (RESELLER ONLY)
========================================
*/
export const updateBranding = async (req, res) => {
  try {
    if (!req.user || !req.user.isReseller)
      return res.status(403).json({ message: "Access denied" });

    const {
      brandName,
      themeColor,
      logo,
      supportWhatsapp,
      supportTelegram,
      supportWhatsappChannel,
    } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found" });

    /*
    ================================
    UPDATE FIELDS
    ================================
    */
    if (brandName !== undefined) user.brandName = brandName;
    if (themeColor !== undefined) user.themeColor = themeColor;
    if (logo !== undefined) user.logo = logo;

    user.supportWhatsapp = supportWhatsapp || "";
    user.supportTelegram = supportTelegram || "";
    user.supportWhatsappChannel = supportWhatsappChannel || "";

    await user.save();

    return res.json({
      message: "Branding updated successfully",
      branding: {
        brandName: user.brandName,
        themeColor: user.themeColor,
        logo: user.logo,
        domain: user.resellerDomain,

        supportWhatsapp: user.supportWhatsapp,
        supportTelegram: user.supportTelegram,
        supportWhatsappChannel: user.supportWhatsappChannel,
      },
    });

  } catch (err) {
    console.error("Update Branding error:", err);

    if (err.name === "ValidationError") {
      return res.status(400).json({
        message: "Invalid support links",
        errors: err.errors,
      });
    }

    res.status(500).json({ message: "Failed to update branding" });
  }
};
