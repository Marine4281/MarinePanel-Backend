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

        // ✅ NO FALLBACK → reseller only
        support: {
          whatsapp: req.reseller.supportWhatsapp || "",
          telegram: req.reseller.supportTelegram || "",
          whatsappChannel:
            req.reseller.supportWhatsappChannel || "",
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

        // ✅ reseller only (no fallback)
        support: {
          whatsapp: req.user.supportWhatsapp || "",
          telegram: req.user.supportTelegram || "",
          whatsappChannel:
            req.user.supportWhatsappChannel || "",
        },
      });
    }

    /*
    ================================
    🟡 USER UNDER RESELLER
    ================================
    */
    if (req.user.resellerOwner) {
      const reseller = await User.findById(
        req.user.resellerOwner
      ).lean();

      if (reseller) {
        return res.json({
          brandName: reseller.brandName || "Reseller Panel",
          logo: reseller.logo || null,
          themeColor: reseller.themeColor || "#16a34a",
          domain: reseller.resellerDomain || null,

          // ✅ user sees reseller support
          support: {
            whatsapp: reseller.supportWhatsapp || "",
            telegram: reseller.supportTelegram || "",
            whatsappChannel:
              reseller.supportWhatsappChannel || "",
          },
        });
      }
    }

    /*
    ================================
    🔵 ADMIN / NORMAL USER (NO RESELLER)
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

        // ✅ ALWAYS SAVE (even empty strings)
        supportWhatsapp: supportWhatsapp || "",
        supportTelegram: supportTelegram || "",
        supportWhatsappChannel: supportWhatsappChannel || "",
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
