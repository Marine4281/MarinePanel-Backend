// middleware/resellerDomainMiddleware.js

import User from "../models/User.js";

const BASE_DOMAIN = "marinepanel.online";

export const detectResellerDomain = async (req, res, next) => {
  try {
    const host = req.headers.host;
    if (!host) return next();

    let reseller = null;

    // 1️⃣ SUBDOMAIN SUPPORT
    if (host.endsWith(BASE_DOMAIN)) {
      const subdomain = host.split(".")[0];
      if (subdomain && subdomain !== "www" && subdomain !== BASE_DOMAIN) {
        reseller = await User.findOne({
          brandSlug: subdomain,
          isReseller: true,
        });
      }
    }

    // 2️⃣ CUSTOM DOMAIN SUPPORT
    if (!reseller) {
      reseller = await User.findOne({
        resellerCustomDomain: host,
        isReseller: true,
      });
    }

    // SAVE INTO REQUEST
    if (reseller) req.reseller = reseller;

    next();

  } catch (error) {
    console.error("Reseller domain detection error:", error);
    next();
  }
};
