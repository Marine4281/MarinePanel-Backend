//controllers/brandingController.js
import User from "../models/User.js";

/*
--------------------------------
Get Branding for Domain
--------------------------------
*/

export const getBranding = async (req, res) => {
  try {
    // Use dynamic brand info from middleware
    const brand = req.brand;

    if (!brand) {
      // fallback
      return res.json({
        brandName: "Marine Panel",
        logo: null,
        themeColor: "#0f172a",
        domain: "marinepanel.online",
      });
    }

    res.json({
      brandName: brand.brandName,
      logo: brand.logo,
      themeColor: brand.themeColor,
      domain: brand.domain,
      resellerId: req.reseller?._id || null,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to load branding",
    });
  }
};
