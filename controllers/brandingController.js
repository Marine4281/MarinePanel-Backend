// controllers/brandingController.js
import User from "../models/User.js";

/*
========================================
PUBLIC BRANDING (DOMAIN-BASED)
========================================
Used for:
- Landing pages
- End users
- White-labeled domains

NOW ALSO RETURNS SUPPORT (RESELLER ONLY)
*/
export const getPublicBranding = async (req, res) => {
  try {
    if (req.brand) {
      return res.json({
        brandName: req.brand.brandName || "Reseller Panel",
        logo: req.brand.logo || null,
        themeColor: req.brand.themeColor || "#16a34a",
        domain: req.brand.domain || null,

        // ✅ SUPPORT (NO FALLBACK)
        supportWhatsapp: req.brand.supportWhatsapp || "",
        supportTelegram: req.brand.supportTelegram || "",
        supportWhatsappChannel:
          req.brand.supportWhatsappChannel || "",
      });
    }

    // Default platform branding (NO support exposed)
    return res.json({
      brandName: "MarinePanel",
      logo: null,
      themeColor: "#f97316",
      domain: "marinepanel.online",

      // ✅ EMPTY (important for SaaS isolation)
      supportWhatsapp: "",
      supportTelegram: "",
      supportWhatsappChannel: "",
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
*/
export const getDashboardBranding = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Reseller → return THEIR branding + support
    if (req.user.isReseller) {
      return res.json({
        brandName: req.user.brandName || "Reseller Panel",
        logo: req.user.logo || null,
        themeColor: req.user.themeColor || "#16a34a",
        domain: req.user.resellerDomain || null,

        // ✅ SUPPORT (STRICT)
        supportWhatsapp: req.user.supportWhatsapp || "",
        supportTelegram: req.user.supportTelegram || "",
        supportWhatsappChannel:
          req.user.supportWhatsappChannel || "",
      });
    }

    // Admin / normal user (no support leak)
    return res.json({
      brandName: "MarinePanel",
      logo: null,
      themeColor: "#f97316",
      domain: "marinepanel.online",

      supportWhatsapp: "",
      supportTelegram: "",
      supportWhatsappChannel: "",
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
NOW ALSO UPDATES SUPPORT
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

    const updateData = {};

    // Branding fields
    if (brandName !== undefined) updateData.brandName = brandName;
    if (themeColor !== undefined) updateData.themeColor = themeColor;
    if (logo !== undefined) updateData.logo = logo;

    // ✅ Support fields (NO fallback logic)
    if (supportWhatsapp !== undefined)
      updateData.supportWhatsapp = supportWhatsapp;

    if (supportTelegram !== undefined)
      updateData.supportTelegram = supportTelegram;

    if (supportWhatsappChannel !== undefined)
      updateData.supportWhatsappChannel =
        supportWhatsappChannel;

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      updateData,
      { new: true }
    );

    return res.json({
      message: "Branding updated successfully",
      branding: {
        brandName: updatedUser.brandName,
        themeColor: updatedUser.themeColor,
        logo: updatedUser.logo,
        domain: updatedUser.resellerDomain,

        // ✅ RETURN SUPPORT
        supportWhatsapp: updatedUser.supportWhatsapp || "",
        supportTelegram: updatedUser.supportTelegram || "",
        supportWhatsappChannel:
          updatedUser.supportWhatsappChannel || "",
      },
    });

  } catch (error) {
    console.error("Update Branding error:", error);
    res.status(500).json({ message: "Failed to update branding" });
  }
};
