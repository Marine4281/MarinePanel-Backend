// controllers/brandingController.js

import Settings from "../models/Settings.js";
import Reseller from "../models/Reseller.js";

export const getBranding = async (req, res) => {
  try {

    /*
    --------------------------------
    1️⃣ Domain Branding
    --------------------------------
    */

    if (req.brand) {
      return res.json({
        brandName: req.brand.brandName || "Reseller Panel",
        logo: req.brand.logo || null,
        themeColor: req.brand.themeColor || "#16a34a", // default green
        domain: req.brand.domain || req.brand.subdomain || null,
      });
    }

    /*
    --------------------------------
    2️⃣ Logged Reseller Dashboard
    --------------------------------
    */

    if (req.user?.isReseller) {

      const reseller = await Reseller.findOne({
        owner: req.user._id
      }).lean();

      if (reseller) {
        return res.json({
          brandName: reseller.brandName || "Reseller Panel",
          logo: reseller.logo || null,
          themeColor: reseller.themeColor || "#16a34a",
          domain: reseller.domain || reseller.subdomain || null,
        });
      }

    }

    /*
    --------------------------------
    3️⃣ Platform Default Branding
    --------------------------------
    */

    const settings = await Settings.findOne().lean();

    return res.json({
      brandName: settings?.platformName || "MarinePanel",
      logo: settings?.logo || null,
      themeColor: settings?.themeColor || "#2563eb",
      domain: settings?.platformDomain || "marinepanel.online",
    });

  } catch (error) {

    console.error("Branding error:", error);

    res.status(500).json({
      message: "Branding load failed",
    });

  }
};
