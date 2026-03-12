import User from "../models/User.js";

/*
--------------------------------
Get Branding for Domain
--------------------------------
*/

export const getBranding = async (req, res) => {
  try {
    // reseller detected from middleware
    const reseller = req.reseller;

    // Default main branding
    if (!reseller) {
      return res.json({
        brandName: "MarinePanel",
        logo: null,
        themeColor: "#0f172a",
        domain: "marinepanel.online",
      });
    }

    res.json({
      brandName: reseller.brandName || "MarinePanel",
      logo: reseller.logo || null,
      themeColor: reseller.themeColor || "#0f172a",
      domain: reseller.customDomain || `${reseller.brandSlug}.marinepanel.online`,
      resellerId: reseller._id,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to load branding",
    });
  }
};
