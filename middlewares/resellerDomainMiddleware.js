// middleware/resellerDomainMiddleware.js

import User from "../models/User.js";

const BASE_DOMAIN = "marinepanel.online";

export const detectResellerDomain = async (req, res, next) => {
  try {
    let host =
      req.headers["x-reseller-domain"] ||
      req.headers.host ||
      "";

    if (!host) return next();

    // Remove port
    host = host.split(":")[0].toLowerCase().trim();

    // Remove www
    host = host.replace(/^www\./, "");

    /*
    -----------------------------
    ✅ MAIN DOMAIN → SKIP
    -----------------------------
    */
    if (host === BASE_DOMAIN) {
      return next();
    }

    let reseller = null;

    /*
    -----------------------------
    ✅ SUBDOMAIN DETECTION
    -----------------------------
    */
    if (host.endsWith(`.${BASE_DOMAIN}`)) {
      const subdomain = host.split(`.${BASE_DOMAIN}`)[0];

      // 🚀 STRICT MATCH (IMPORTANT FIX)
      reseller = await User.findOne({
        isReseller: true,
        resellerDomain: subdomain,
      });
    }

    /*
    -----------------------------
    ✅ CUSTOM DOMAIN
    -----------------------------
    */
    if (!reseller) {
      reseller = await User.findOne({
        isReseller: true,
        resellerCustomDomain: host,
      });
    }

    /*
    -----------------------------
    ✅ ATTACH RESELLER
    -----------------------------
    */
    if (reseller) {
      req.reseller = reseller;

      req.brand = {
        brandName: reseller.brandName || reseller.brandSlug,
        logo: reseller.logo || null,
        themeColor: reseller.themeColor || "#16a34a",
        domain:
          reseller.resellerCustomDomain ||
          `${reseller.resellerDomain}.${BASE_DOMAIN}`,
      };
    }

    next();
  } catch (error) {
    console.error("Reseller domain detection error:", error);
    next();
  }
};
