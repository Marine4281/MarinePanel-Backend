//controllers/brandingController.js
import User from "../models/User.js";

/*
--------------------------------
Get Branding for Domain
--------------------------------
*/

export const getBranding = async (req, res) => {
  try {
    const brand = req.brand; // <-- always comes from middleware

    if (!brand) {
      return res.json({
        brandName: "MarinePanel",
        logo: null,
        themeColor: "#0f172a",
        domain: "marinepanel.online",
      });
    }

    res.json({
      brandName: brand.brandName,   // <-- use brandName from req.brand
      logo: brand.logo,
      themeColor: brand.themeColor,
      domain: brand.domain,
      resellerId: req.reseller?._id || null,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to load branding" });
  }
};
