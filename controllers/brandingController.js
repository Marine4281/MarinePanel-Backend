// controllers/brandingController.js

import User from "../models/User.js";
import Settings from "../models/Settings.js";

/*
========================================
PUBLIC BRANDING (DOMAIN-BASED)
========================================
Used for:
- Landing pages
- End users
- White-labeled domains

DOES NOT depend on logged-in user
*/
export const getPublicBranding = async (req, res) => {
  try {
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

        // ✅ NEW: Reseller Support
        support: {
          whatsapp: req.reseller.supportWhatsapp || "",
          telegram: req.reseller.supportTelegram || "",
          whatsappChannel: req.reseller.supportWhatsappChannel || "",
        },
      });
    }

    /*
    ================================
    🔵 MAIN PANEL (ADMIN)
    ================================
    */
    const settings = await Settings.findOne().lean();

    return res.json({
      brandName: "MarinePanel",
      logo: null,
      themeColor: "#f97316",
      domain: "marinepanel.online",

      // ✅ NEW: Admin Support
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
Used for:
- Reseller dashboard
- Branding settings page

ALWAYS tied to logged-in user
*/
export const getDashboardBranding = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

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

        // ✅ NEW: Reseller Support (for dashboard editing UI)
        support: {
          whatsapp: req.user.supportWhatsapp || "",
          telegram: req.user.supportTelegram || "",
          whatsappChannel: req.user.supportWhatsappChannel || "",
        },
      });
    }

    /*
    ================================
    🔵 ADMIN / NORMAL USER
    ================================
    */
    const settings = await Settings.findOne().lean();

    return res.json({
      brandName: "MarinePanel",
      logo: null,
      themeColor: "#f97316",
      domain: "marinepanel.online",

      // ✅ Admin support fallback
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
Now also updates SUPPORT (SaaS-ready)
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

      // ✅ NEW SUPPORT FIELDS
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

        // ✅ Return support (important for frontend sync)
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
