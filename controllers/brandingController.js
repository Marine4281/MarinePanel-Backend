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

    const { brandName, themeColor, logo, supportWhatsapp, supportTelegram, supportWhatsappChannel } = req.body;

    // Coerce null → "" for support fields to pass validators
    const updateData = {
      ...(brandName !== undefined && { brandName }),
      ...(themeColor !== undefined && { themeColor }),
      ...(logo !== undefined && { logo }),
      ...(supportWhatsapp !== undefined && { supportWhatsapp: supportWhatsapp ?? "" }),
      ...(supportTelegram !== undefined && { supportTelegram: supportTelegram ?? "" }),
      ...(supportWhatsappChannel !== undefined && { supportWhatsappChannel: supportWhatsappChannel ?? "" }),
    };

    // Use findById + manual assignment + save to ensure validators run
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found" });

    Object.keys(updateData).forEach((key) => {
      user[key] = updateData[key];
    });

    await user.save(); // ✅ runs all validators, defaults, coercion

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
      return res.status(400).json({ message: "Invalid support links", errors: err.errors });
    }
    res.status(500).json({ message: "Failed to update branding" });
  }
};
