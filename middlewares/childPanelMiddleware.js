// middleware/childPanelMiddleware.js

import User from "../models/User.js";

const BASE_DOMAIN = "marinepanel.online";

export const detectChildPanelDomain = async (req, res, next) => {
  try {
    let host =
      req.headers["x-childpanel-domain"] ||
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

    // Skip if already detected as a reseller domain
    if (req.reseller) return next();

    let childPanel = null;
    let slug = null;

    /*
    -----------------------------
    SUBDOMAIN CHECK
    e.g. cp1.marinepanel.online
    -----------------------------
    */
    const parts = host.split(".");
    const baseParts = BASE_DOMAIN.split(".");

    if (
      parts.length === 3 &&
      parts[1] === baseParts[0] &&
      parts[2] === baseParts[1]
    ) {
      slug = parts[0];
    }

    /*
    -----------------------------
    1. CHECK CUSTOM DOMAIN FIRST
    -----------------------------
    */
    childPanel = await User.findOne({
      isChildPanel: true,
      childPanelDomain: host,
      childPanelIsActive: true,
    });

    /*
    -----------------------------
    2. FALLBACK TO SLUG/SUBDOMAIN
    (testing only)
    -----------------------------
    */
    if (!childPanel && slug) {
      childPanel = await User.findOne({
        isChildPanel: true,
        childPanelSlug: slug,
        childPanelIsActive: true,
      });
    }

    /*
    -----------------------------
    ATTACH CHILD PANEL TO REQUEST
    -----------------------------
    */
    if (childPanel) {
      req.childPanel = childPanel;

      req.brand = {
        brandName: childPanel.childPanelBrandName || childPanel.childPanelSlug,
        logo: childPanel.childPanelLogo || null,
        themeColor: childPanel.childPanelThemeColor || "#1e40af",
        domain:
          childPanel.childPanelDomain ||
          `${childPanel.childPanelSlug}.${BASE_DOMAIN}`,
        supportWhatsapp: childPanel.childPanelSupportWhatsapp || "",
        supportTelegram: childPanel.childPanelSupportTelegram || "",
        supportWhatsappChannel: childPanel.childPanelSupportWhatsappChannel || "",
      };
    }

    next();
  } catch (error) {
    console.error("Child panel domain detection error:", error);
    next();
  }
};

export const childPanelOnly = (req, res, next) => {
  if (!req.childPanel) {
    return res.status(403).json({
      message: "Access denied: Child panel only route",
    });
  }

  next();
};
