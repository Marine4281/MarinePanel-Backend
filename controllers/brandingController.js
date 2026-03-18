// controllers/brandingController.js

import User from "../models/User.js";

/*
--------------------------------
PUBLIC BRANDING (DOMAIN ONLY)
--------------------------------
*/
export const getPublicBranding = async (req, res) => {
  try {
    if (req.brand) {
      return res.json({
        brandName: req.brand.brandName || "Reseller Panel",
        logo: req.brand.logo || null,
        themeColor: req.brand.themeColor || "#16a34a",
        domain: req.brand.domain || null,
      });
    }

    // Default platform branding
    return res.json({
      brandName: "MarinePanel",
      logo: null,
      themeColor: "#f97316",
      domain: "marinepanel.online",
    });

  } catch (error) {
    console.error("Public branding error:", error);
    res.status(500).json({ message: "Failed to load branding" });
  }
};


/*
--------------------------------
DASHBOARD BRANDING (RESELLER ONLY)
--------------------------------
*/
export const getDashboardBranding = async (req, res) => {
  try {
    if (!req.user?.isReseller) {
      return res.status(403).json({ message: "Not a reseller" });
    }

    // ✅ ALWAYS fetch from DB (NOT req.user)
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json({
      brandName: user.brandName || "Reseller Panel",
      logo: user.logo || null,
      themeColor: user.themeColor || "#16a34a",
      domain:
        user.resellerCustomDomain ||
        `${user.resellerDomain}.marinepanel.online`,
    });

  } catch (error) {
    console.error("Dashboard branding error:", error);
    res.status(500).json({ message: "Failed to load branding" });
  }
};
