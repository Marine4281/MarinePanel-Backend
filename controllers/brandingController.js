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
        logo: req.brand.logo || null,
        themeColor: req.brand.themeColor || "#16a34a",
        domain: req.brand.domain || null,

        // ✅ SUPPORT (ACTIVE ONLY)
        supportWhatsapp: req.brand.supportWhatsapp || "",
        supportTelegram: req.brand.supportTelegram || "",
        supportWhatsappChannel:
          req.brand.supportWhatsappChannel || "",
      });
    }

    // ✅ Default platform branding
    return res.json({
      brandName: "MarinePanel",
      logo: null,
      themeColor: "#f97316",
      domain: "marinepanel.online",

      // ❌ No support leakage
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
        logo: req.user.logo || null,
        themeColor: req.user.themeColor || "#16a34a",
        domain: req.user.resellerDomain || null,

        // ✅ SUPPORT
        supportWhatsapp: req.user.supportWhatsapp || "",
        supportTelegram: req.user.supportTelegram || "",
        supportWhatsappChannel:
          req.user.supportWhatsappChannel || "",
      });
    }

    // ❌ Inactive reseller OR normal user
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
UPDATE BRANDING (ACTIVE RESELLER ONLY)
========================================
*/
export const updateBranding = async (req, res) => {
  try {
    const isActiveReseller =
      req.user &&
      req.user.isReseller &&
      req.user.resellerActivatedAt;

    // ❌ Block inactive resellers
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

    // Branding
    if (brandName !== undefined) updateData.brandName = brandName;
    if (themeColor !== undefined) updateData.themeColor = themeColor;
    if (logo !== undefined) updateData.logo = logo;

    // ✅ Support (active only by design)
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
