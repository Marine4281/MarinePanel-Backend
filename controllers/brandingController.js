//controllers/brandingController.js
const User = require("../models/User");

/**
 * Get Branding
 * Priority:
 * 1) Logged in reseller (dashboard)
 * 2) Domain reseller (public white label)
 * 3) Default platform branding
 */

exports.getBranding = async (req, res) => {
  try {
    // 1️⃣ Dashboard branding (logged reseller)
    if (req.user && req.user.isReseller) {
      return res.json({
        brandName: req.user.brandName || "Reseller Panel",
        logo: req.user.logo || null,
        themeColor: req.user.themeColor || "#0f172a",
        domain: req.user.resellerDomain || null,
      });
    }

    // 2️⃣ Domain branding (public white label)
    if (req.brand) {
      return res.json({
        brandName: req.brand.brandName || "Reseller Panel",
        logo: req.brand.logo || null,
        themeColor: req.brand.themeColor || "#0f172a",
        domain: req.brand.domain || null,
      });
    }

    // 3️⃣ Fallback
    return res.json({
      brandName: "Reseller Panel",
      logo: null,
      themeColor: "#0f172a",
      domain: null,
    });

  } catch (error) {
    console.error("Branding error:", error);
    res.status(500).json({ message: "Branding load failed" });
  }
};
