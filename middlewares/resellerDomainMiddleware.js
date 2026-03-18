// middleware/resellerDomainMiddleware.js

import User from "../models/User.js";

const BASE_DOMAIN = "marinepanel.online";

export const detectResellerDomain = async (req, res, next) => {
  try {

    let host =
      req.headers["x-reseller-domain"] ||
      req.headers.host ||
      "";

    if (!host) {
      return next();
    }

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
    SUBDOMAIN DETECTION
    -----------------------------
    */

    if (host.endsWith(BASE_DOMAIN)) {
      subdomain = host.replace(`.${BASE_DOMAIN}`, "");
    }

    /*
    -----------------------------
    DATABASE SEARCH
    -----------------------------
    */

    reseller = await User.findOne({
      isReseller: true,
      $or: [
        subdomain ? { brandSlug: subdomain } : null,
        { resellerDomain: host }
      ].filter(Boolean),
    });

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
        themeColor: reseller.themeColor || "#16a34a", // default green
        domain:
          reseller.resellerDomain ||
          `${reseller.brandSlug}.${BASE_DOMAIN}`,
      };

    }

    next();

  } catch (error) {

    console.error("Reseller domain detection error:", error);
    next();

  }
};// middleware/resellerDomainMiddleware.js

import User from "../models/User.js";

const BASE_DOMAIN = "marinepanel.online";

export const detectResellerDomain = async (req, res, next) => {
  try {

    let host =
      req.headers["x-reseller-domain"] ||
      req.headers.host ||
      "";

    if (!host) {
      return next();
    }

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
    SUBDOMAIN DETECTION
    -----------------------------
    */

    if (host.endsWith(BASE_DOMAIN)) {
      subdomain = host.replace(`.${BASE_DOMAIN}`, "");
    }

    /*
    -----------------------------
    DATABASE SEARCH
    -----------------------------
    */

    reseller = await User.findOne({
      isReseller: true,
      $or: [
        subdomain ? { brandSlug: subdomain } : null,
        { resellerDomain: host }
      ].filter(Boolean),
    });

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
        themeColor: reseller.themeColor || "#16a34a", // default green
        domain:
          reseller.resellerDomain ||
          `${reseller.brandSlug}.${BASE_DOMAIN}`,
      };

    }

    next();

  } catch (error) {

    console.error("Reseller domain detection error:", error);
    next();

  }
};
