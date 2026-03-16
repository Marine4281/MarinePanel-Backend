import User from "../models/User.js";

export const getBranding = async (req, res) => {
  try {
    // Priority 1: req.brand (from subdomain or custom domain)
    if (req.brand) {
      return res.json({
        brandName: req.brand.brandName || "Reseller Panel",
        logo: req.brand.logo || null,
        themeColor: req.brand.themeColor || "#16a34a",
        domain: req.brand.domain || null,
      });
    }

    // Priority 2: req.user (logged-in reseller)
    if (req.user?.isReseller) {
      return res.json({
        brandName: req.user.brandName || "Reseller Panel",
        logo: req.user.logo || null,
        themeColor: req.user.themeColor || "#16a34a",
        domain: req.user.resellerDomain || null,
      });
    }

    // Default platform branding
    return res.json({
      brandName: "MarinePanel",
      logo: null,
      themeColor: "#2563eb",
      domain: "marinepanel.online",
    });
  } catch (error) {
    console.error("Branding error:", error);
    res.status(500).json({ message: "Branding load failed" });
  }
};
