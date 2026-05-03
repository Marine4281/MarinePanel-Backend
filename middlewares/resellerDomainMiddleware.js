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
    Skip platform domain && Child panel
    -----------------------------
    */
    if (req.headers["x-childpanel-domain"]) {
      return next();
    }
    
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
    const parts = host.split(".");
    const baseParts = BASE_DOMAIN.split(".");

    if (
      parts.length === 3 &&
      parts[1] === baseParts[0] &&
      parts[2] === baseParts[1]
    ) {
      subdomain = parts[0];
    }

    /*
    -----------------------------
    1. CHECK FULL DOMAIN FIRST
    -----------------------------
    */
    reseller = await User.findOne({
      isReseller: true,
      resellerDomain: host,
    });

    /*
    -----------------------------
    2. FALLBACK TO SUBDOMAIN
    -----------------------------
    */
    if (!reseller && subdomain) {
      reseller = await User.findOne({
        isReseller: true,
        brandSlug: subdomain,
      });
    }

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

        supportWhatsapp: reseller.supportWhatsapp || "",
        supportTelegram: reseller.supportTelegram || "",
        supportWhatsappChannel:
          reseller.supportWhatsappChannel || "",
      };
    }

    next();
  } catch (error) {
    console.error("Reseller domain detection error:", error);
    next();
  }
};
