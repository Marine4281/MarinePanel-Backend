// middleware/resellerDomainMiddleware.js

import User from "../models/User.js";

const BASE_DOMAIN = "marinepanel.online";

export const detectResellerDomain = async (req, res, next) => {
  try {
    console.log("------ Reseller Domain Detection Start ------");

    // Prefer custom header from frontend, fallback to host
    let host =
      req.headers["x-reseller-domain"] ||
      req.headers.host ||
      "";

    console.log("Raw Host Header:", host);

    if (!host) {
      console.log("No host header detected. Skipping reseller detection.");
      console.log("------ Detection End ------\n");
      return next();
    }

    // Remove port (example: smmlord.marinepanel.online:5173)
    host = host.split(":")[0];

    // Normalize
    host = host.toLowerCase().trim();

    // Remove www
    host = host.replace(/^www\./, "");

    console.log("Normalized Host:", host);

    // Skip main domain requests
    if (host === BASE_DOMAIN) {
      console.log("Main platform domain detected. No reseller.");
      console.log("------ Detection End ------\n");
      return next();
    }

    let reseller = null;
    let subdomain = null;

    // =========================
    // 1️⃣ SUBDOMAIN DETECTION
    // =========================
    if (host.endsWith(BASE_DOMAIN)) {
      console.log("Host matches base domain:", BASE_DOMAIN);

      const parts = host.split(".");

      // example: smmlord.marinepanel.online
      if (parts.length > 2) {
        subdomain = parts[0];
      }

      console.log("Detected Subdomain:", subdomain);
    }

    // =========================
    // 2️⃣ DATABASE SEARCH
    // =========================
    console.log("Searching reseller in database...");

    reseller = await User.findOne({
      isReseller: true,
      $or: [
        subdomain ? { brandSlug: subdomain } : null,
        { resellerDomain: host }
      ].filter(Boolean),
    });

    if (reseller) {
      console.log("Reseller FOUND:", reseller.email);
      console.log("Matched brandSlug:", reseller.brandSlug);
      console.log("Matched resellerDomain:", reseller.resellerDomain);
    } else {
      console.log("No reseller matched for:");
      console.log("brandSlug:", subdomain);
      console.log("resellerDomain:", host);
    }

    // =========================
    // 3️⃣ ATTACH TO REQUEST
    // =========================
    if (reseller) {
      req.reseller = reseller;
      console.log("Reseller attached to request:", reseller._id);
    } else {
      console.log("No reseller detected for this request.");
    }

    console.log("------ Detection End ------\n");

    next();

  } catch (error) {
    console.error("❌ Reseller domain detection error:", error);
    next();
  }
};
