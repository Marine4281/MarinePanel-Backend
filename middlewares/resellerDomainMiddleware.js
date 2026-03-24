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
    host = host.split(":")[0];

    // Normalize
    host = host.toLowerCase().trim();

    // Remove www
    host = host.replace(/^www\./, "");

    /*
    -----------------------------
    Skip platform domain
    -----------------------------
    */
    if (host === BASE_DOMAIN) {
      return next();
    }

    let reseller = null;
    let subdomain = null;

    /*
    -----------------------------
    STRICT SUBDOMAIN CHECK
    -----------------------------
    */
    const isSubdomain = host.endsWith(`.${BASE_DOMAIN}`);

    if (isSubdomain) {
      subdomain = host.replace(`.${BASE_DOMAIN}`, "");
    }

    /*
    -----------------------------
    DATABASE SEARCH (SAFE)
    -----------------------------
    */
    const query = {
      isReseller: true,
      $or: [],
    };

    if (subdomain) {
      query.$or.push({ brandSlug: subdomain });
    }

    query.$or.push({ resellerDomain: host });

    reseller = await User.findOne(query);

    /*
    -----------------------------
    ATTACH RESELLER
    -----------------------------
    */
    if (reseller) {
      req.reseller = reseller;

      req.brand = {
        brandName: reseller.brandName || reseller.brandSlug,
        logo: reseller.logo || null,
        themeColor: reseller.themeColor || "#16a34a",
        domain:
          reseller.resellerDomain ||
          `${reseller.brandSlug}.${BASE_DOMAIN}`,
        
        // ✅ Support
        supportWhatsapp: reseller.supportWhatsapp || "",
        supportTelegram: reseller.supportTelegram || "",
        supportWhatsappChannel: reseller.supportWhatsappChannel || "",
      };
    }

    next();
  } catch (error) {
    console.error("Reseller domain detection error:", error);
    next();
  }
};
