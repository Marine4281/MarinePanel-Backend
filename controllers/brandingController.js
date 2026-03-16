import User from "../models/User.js";

export const getBranding = async (req, res) => {
  try {
    if (req.brand) {
      return res.json({
        brandName: req.brand.resellerBrand || "Reseller Panel",
        logo: req.brand.logo || null,
        themeColor: req.brand.themeColor || "#16a34a",
        domain: req.brand.resellerDomain || null,
      });
    }

    if (req.user?.isReseller) {
      return res.json({
        brandName: req.user.resellerBrand || req.user.brandName || "Reseller Panel",
        logo: req.user.logo || null,
        themeColor: req.user.themeColor || "#16a34a",
        domain: req.user.resellerDomain || null,
      });
    }

    // Optional: if neither is present, you can return a hardcoded default
    return res.json({
      brandName: "MarinePanel",
      logo: null,
      themeColor: "#2563eb",
      domain: "marinepanel.online",
    });
  } catch (error) {
    console.error("Branding error:", error);
    res.status(500).json({
      message: "Branding load failed",
    });
  }
};
