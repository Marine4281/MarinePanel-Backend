// controllers/brandingController.js

import User from "../models/User.js";

/**
 * Get Branding
 * Priority:
 * 1) Domain reseller (white label site)
 * 2) Logged in reseller (dashboard)
 * 3) Default platform branding
 */

export const getBranding = async (req, res) => {
  try {

    /*
    --------------------------------
    1️⃣ Domain Branding (Highest Priority)
    --------------------------------
    */

    if (req.brand) {
      return res.json({
        brandName: req.brand.brandName || "Reseller Panel",
        logo: req.brand.logo || null,
        themeColor: req.brand.themeColor || "#ff6b00",
        domain: req.brand.domain || null,
      });
    }

    /*
    --------------------------------
    2️⃣ Logged-in Reseller Dashboard
    --------------------------------
    */

    if (req.user && req.user.isReseller) {
      return res.json({
        brandName: req.user.brandName || "Reseller Panel",
        logo: req.user.logo || null,
        themeColor: req.user.themeColor || "#ff6b00",
        domain: req.user.resellerDomain || null,
      });
    }

    /*
    --------------------------------
    3️⃣ Platform Default Branding
    --------------------------------
    */

    return res.json({
      brandName: "Reseller Panel",
      logo: null,
      themeColor: "#ff6b00",
      domain: null,
    });

  } catch (error) {

    console.error("Branding error:", error);

    res.status(500).json({
      message: "Branding load failed",
    });

  }
};
