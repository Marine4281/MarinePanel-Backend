// controllers/brandingController.js
import User from "../models/User.js";

export const getBranding = async (req, res) => {
  try {
    /*
    --------------------------------
    PRIORITY: DOMAIN-BASED BRANDING ONLY
    --------------------------------
    This ensures branding is tied to the domain,
    NOT the logged-in user
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
    DEFAULT PLATFORM BRANDING
    --------------------------------
    Used when no reseller domain is detected
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
