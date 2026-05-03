// middlewares/resellerDomainMiddleware.js

import User from "../models/User.js";

const BASE_DOMAIN = "marinepanel.online";

export const detectResellerDomain = async (req, res, next) => {
  try {
    // ── IMPROVEMENT 1 ──────────────────────────────────────────
    // Skip immediately when the frontend has already told us this
    // is a child panel request. No DB query, no processing.
    // This is the SEC-1 / audit fix — child panel slugs and
    // reseller slugs share the same *.marinepanel.online namespace,
    // so without this guard a child panel subdomain could
    // accidentally match a reseller with the same brandSlug.
    // ───────────────────────────────────────────────────────────
    if (req.headers["x-childpanel-domain"]) {
      return next();
    }

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

    // Skip main platform domain
    if (host === BASE_DOMAIN) return next();

    let reseller = null;
    let subdomain = null;

    /*
    -----------------------------
    STRICT SUBDOMAIN CHECK
    e.g. smmlord.marinepanel.online → subdomain = "smmlord"
    Only matches exactly 3 parts to avoid false matches on
    deeper subdomains like a.b.marinepanel.online
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
    1. CHECK FULL CUSTOM DOMAIN FIRST
    e.g. smmpro.com
    -----------------------------
    */
    reseller = await User.findOne({
      isReseller: true,
      resellerDomain: host,
    }).select(
      "brandName brandSlug logo themeColor resellerDomain " +
      "supportWhatsapp supportTelegram supportWhatsappChannel " +
      "isBlocked resellerCommissionRate"
    ).lean();

    /*
    -----------------------------
    2. FALLBACK TO SUBDOMAIN SLUG
    e.g. smmlord.marinepanel.online
    -----------------------------
    */
    if (!reseller && subdomain) {
      reseller = await User.findOne({
        isReseller: true,
        brandSlug: subdomain,
      }).select(
        "brandName brandSlug logo themeColor resellerDomain " +
        "supportWhatsapp supportTelegram supportWhatsappChannel " +
        "isBlocked resellerCommissionRate"
      ).lean();
    }

    /*
    -----------------------------
    ATTACH RESELLER
    -----------------------------
    */
    if (reseller) {
      // ── IMPROVEMENT 2 ────────────────────────────────────────
      // Blocked resellers still get detected (req.reseller is
      // set) so that auth routes can return the right error
      // message, but req.brand is NOT attached. This prevents
      // a blocked reseller's branding from appearing on their
      // domain while still routing their users correctly.
      // ─────────────────────────────────────────────────────────
      req.reseller = reseller;

      if (!reseller.isBlocked) {
        req.brand = {
          brandName:            reseller.brandName || reseller.brandSlug,
          logo:                 reseller.logo || null,
          themeColor:           reseller.themeColor || "#16a34a",
          domain:
            reseller.resellerDomain ||
            `${reseller.brandSlug}.${BASE_DOMAIN}`,
          supportWhatsapp:      reseller.supportWhatsapp || "",
          supportTelegram:      reseller.supportTelegram || "",
          supportWhatsappChannel: reseller.supportWhatsappChannel || "",
        };
      }
    }

    next();
  } catch (error) {
    // ── IMPROVEMENT 3 ────────────────────────────────────────
    // Log the host that caused the error so you can debug
    // bad domain values in production logs without having to
    // reproduce the exact request.
    // ─────────────────────────────────────────────────────────
    console.error(
      "Reseller domain detection error [host:%s]:",
      req.headers["x-reseller-domain"] || req.headers.host || "unknown",
      error.message
    );
    next(); // always continue — never block a request on detection failure
  }
};
