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

    // Remove port if exists (e.g., smmlord.marinepanel.online:5173)
    host = host.split(":")[0].toLowerCase().trim();

    console.log("Normalized Host:", host);

    let reseller = null;

    // =========================
    // 1️⃣ SUBDOMAIN SUPPORT
    // =========================
    if (host.endsWith(BASE_DOMAIN)) {
      console.log("Host matches base domain:", BASE_DOMAIN);

      const parts = host.split(".");
      const subdomain = parts.length > 2 ? parts[0] : null;

      console.log("Detected Subdomain:", subdomain);

      if (
        subdomain &&
        subdomain !== "www" &&
        subdomain !== BASE_DOMAIN
      ) {
        console.log("Searching reseller with brandSlug:", subdomain);

        reseller = await User.findOne({
          brandSlug: subdomain,
          isReseller: true,
        });

        if (reseller) {
          console.log("Reseller FOUND via subdomain:", reseller.email);
        } else {
          console.log("No reseller found for brandSlug:", subdomain);
        }
      } else {
        console.log("Subdomain not valid for reseller detection.");
      }
    } else {
      console.log("Host does not match base domain.");
    }

    // =========================
    // 2️⃣ CUSTOM DOMAIN SUPPORT
    // =========================
    if (!reseller) {
      console.log("Checking custom domain match for:", host);

      reseller = await User.findOne({
        resellerDomain: host, // FIXED FIELD NAME
        isReseller: true,
      });

      if (reseller) {
        console.log("Reseller FOUND via custom domain:", reseller.email);
      } else {
        console.log("No reseller found for custom domain:", host);
      }
    }

    // =========================
    // 3️⃣ SAVE TO REQUEST
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
