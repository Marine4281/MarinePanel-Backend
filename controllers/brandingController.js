// controllers/brandingController.js

import User from "../models/User.js";

export const getBranding = async (req, res) => {
  try {
    /*
    --------------------------------
    1️⃣ DOMAIN BRANDING (PUBLIC USERS)
    --------------------------------
    */
    if (req.brand) {
      return res.json({
        brandName: req.brand.brandName || "Reseller Panel",
        logo: req.brand.logo || null,
        themeColor: req.brand.themeColor || "#16a34a",
        domain: req.brand.domain || null,
      });
    }

    /*
    --------------------------------
    2️⃣ LOGGED-IN RESELLER (DASHBOARD)
    --------------------------------
    */
    if (req.user?.isReseller) {
      return res.json({
        brandName: req.user.brandName || "Reseller Panel",
        logo: req.user.logo || null,
        themeColor: req.user.themeColor || "#16a34a",
        domain:
          req.user.resellerCustomDomain ||
          `${req.user.resellerDomain}.marinepanel.online`,
      });
    }

    /*
    --------------------------------
    3️⃣ DEFAULT PLATFORM
    --------------------------------
    */
    return res.json({
      brandName: "MarinePanel",
      logo: null,
      themeColor: "#f97316",
      domain: "marinepanel.online",
    });

  } catch (error) {
    console.error("Branding error:", error);
    res.status(500).json({ message: "Branding load failed" });
  }
};
