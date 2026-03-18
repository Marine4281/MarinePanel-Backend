// controllers/brandingController.js

import User from "../models/User.js";

/*
--------------------------------
PUBLIC (DOMAIN-BASED)
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
DASHBOARD (LOGGED-IN RESELLER)
--------------------------------
*/
export const getDashboardBranding = async (req, res) => {
  try {
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

    return res.status(403).json({ message: "Not a reseller" });

  } catch (error) {
    console.error("Dashboard branding error:", error);
    res.status(500).json({ message: "Failed to load branding" });
  }
};
