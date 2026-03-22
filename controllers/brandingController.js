// controllers/brandingController.js

import User from "../models/User.js";
import Settings from "../models/Settings.js";

/*
========================================
PUBLIC BRANDING (DOMAIN-BASED)
========================================
*/
export const getPublicBranding = async (req, res) => {
  try {
    // ✅ Fetch once (needed for fallback)
    const settings = await Settings.findOne().lean();

    /*
    ================================
    🟢 RESELLER DOMAIN
    ================================
    */
    if (req.brand && req.reseller) {
      return res.json({
        brandName: req.brand.brandName || "Reseller Panel",
        logo: req.brand.logo || null,
        themeColor: req.brand.themeColor || "#16a34a",
        domain: req.brand.domain || null,

        // ✅ FIXED: SaaS fallback (reseller → admin → "")
        support: {
          whatsapp:
            req.reseller.supportWhatsapp ||
            settings?.supportWhatsapp ||
            "",
          telegram:
            req.reseller.supportTelegram ||
            settings?.supportTelegram ||
            "",
          whatsappChannel:
            req.reseller.supportWhatsappChannel ||
            settings?.supportWhatsappChannel ||
            "",
        },
      });
    }

    /*
    ================================
    🔵 MAIN PANEL (ADMIN)
    ================================
    */
    return res.json({
      brandName: "MarinePanel",
      logo: null,
      themeColor: "#f97316",
      domain: "marinepanel.online",

      support: {
        whatsapp: settings?.supportWhatsapp || "",
        telegram: settings?.supportTelegram || "",
        whatsappChannel: settings?.supportWhatsappChannel || "",
      },
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

    // ✅ Fetch once for fallback
    const settings = await Settings.findOne().lean();

    /*
    ================================
    🟢 RESELLER DASHBOARD
    ================================
    */
    if (req.user.isReseller) {
      return res.json({
        brandName: req.user.brandName || "Reseller Panel",
        logo: req.user.logo || null,
        themeColor: req.user.themeColor || "#16a34a",
        domain: req.user.resellerDomain || null,

        // ✅ FIXED: fallback added
        support: {
          whatsapp:
            req.user.supportWhatsapp ||
            settings?.supportWhatsapp ||
            "",
          telegram:
            req.user.supportTelegram ||
            settings?.supportTelegram ||
            "",
          whatsappChannel:
            req.user.supportWhatsappChannel ||
            settings?.supportWhatsappChannel ||
            "",
        },
      });
    }

    /*
    ================================
    🔵 ADMIN / NORMAL USER
    ================================
    */
    return res.json({
      brandName: "MarinePanel",
      logo: null,
      themeColor: "#f97316",
      domain: "marinepanel.online",

      support: {
        whatsapp: settings?.supportWhatsapp || "",
        telegram: settings?.supportTelegram || "",
        whatsappChannel: settings?.supportWhatsappChannel || "",
      },
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
    if (!req.user || !req.user.isReseller) {
      return res.status(403).json({ message: "Access denied" });
    }

    const {
      brandName,
      themeColor,
      logo,

      // ✅ SUPPORT FIELDS
      supportWhatsapp,
      supportTelegram,
      supportWhatsappChannel,
    } = req.body;

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      {
        brandName,
        themeColor,
        logo,

        // ✅ Save support
        supportWhatsapp,
        supportTelegram,
        supportWhatsappChannel,
      },
      { new: true }
    );

    return res.json({
      message: "Branding updated successfully",
      branding: {
        brandName: updatedUser.brandName,
        themeColor: updatedUser.themeColor,
        logo: updatedUser.logo,
        domain: updatedUser.resellerDomain,

        // ✅ Keep consistent response
        support: {
          whatsapp: updatedUser.supportWhatsapp || "",
          telegram: updatedUser.supportTelegram || "",
          whatsappChannel:
            updatedUser.supportWhatsappChannel || "",
        },
      },
    });
  } catch (error) {
    console.error("Update Branding error:", error);
    res.status(500).json({ message: "Failed to update branding" });
  }
};
