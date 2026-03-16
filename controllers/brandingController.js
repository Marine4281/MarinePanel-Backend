// controllers/brandingController.js

import Settings from "../models/Settings.js";

/*
--------------------------------
Get Branding
--------------------------------
Priority:
1) Domain reseller
2) Logged reseller
3) Platform settings
*/

export const getBranding = async (req, res) => {
  try {

    /*
    --------------------------------
    1️⃣ Domain Branding
    --------------------------------
    */

    if (req.brand) {
      return res.json({
        brandName: req.brand.brandName || null,
        logo: req.brand.logo || null,
        themeColor: req.brand.themeColor || null,
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
        brandName: req.user.brandName || null,
        logo: req.user.logo || null,
        themeColor: req.user.themeColor || null,
        domain: req.user.resellerDomain || null,
      });
    }

    /*
    --------------------------------
    3️⃣ Platform Default Branding
    --------------------------------
    */

    const settings = await Settings.findOne();

    return res.json({
      brandName: settings?.platformName || null,
      logo: settings?.logo || null,
      themeColor: settings?.themeColor || null,
      domain: settings?.platformDomain || null,
    });

  } catch (error) {

    console.error("Branding error:", error);

    res.status(500).json({
      message: "Branding load failed",
    });

  }
};
