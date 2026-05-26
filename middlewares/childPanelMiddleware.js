// middleware/childPanelMiddleware.js

import User from "../models/User.js";

const BASE_DOMAIN = "marinepanel.online";

/*
====================================================
DETECT CHILD PANEL DOMAIN / SUBDOMAIN
====================================================
*/
export const detectChildPanelDomain = async (req, res, next) => {
  try {
    let host =
      req.headers["x-childpanel-domain"] ||
      req.headers.host ||
      "";

    // Skip if no host
    if (!host) {
      return next();
    }

    /*
    -----------------------------
    REMOVE PORT
    e.g. localhost:5000
    -----------------------------
    */
    host = host.split(":")[0];

    /*
    -----------------------------
    NORMALIZE
    -----------------------------
    */
    host = host.toLowerCase().trim();

    /*
    -----------------------------
    REMOVE WWW
    -----------------------------
    */
    host = host.replace(/^www\./, "");

    /*
    -----------------------------
    SKIP MAIN DOMAIN
    -----------------------------
    */
    if (host === BASE_DOMAIN) {
      return next();
    }

    /*
    -----------------------------
    SKIP IF ALREADY DETECTED
    -----------------------------
    */
    if (req.reseller) {
      return next();
    }

    let childPanel = null;
    let slug = null;

    /*
    ====================================================
    SUBDOMAIN CHECK
    e.g. cp1.marinepanel.online
    ====================================================
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
    ====================================================
    1. CHECK CUSTOM DOMAIN FIRST
    ====================================================
    */
    childPanel = await User.findOne({
      isChildPanel: true,
      childPanelDomain: host,
      childPanelIsActive: true,
    });

    /*
    ====================================================
    2. FALLBACK TO SUBDOMAIN / SLUG
    ====================================================
    */
    if (!childPanel && slug) {
      childPanel = await User.findOne({
        isChildPanel: true,
        childPanelSlug: slug,
        childPanelIsActive: true,
      });
    }

    /*
    ====================================================
    CHECK SUBSCRIPTION EXPIRY
    ====================================================
    */
    if (
      childPanel &&
      childPanel.childPanelNextBilledAt &&
      new Date() > new Date(childPanel.childPanelNextBilledAt)
    ) {
      console.log(
        "Child panel expired:",
        childPanel._id,
        childPanel.childPanelNextBilledAt
      );

      childPanel = null;
    }

    /*
    ====================================================
    ATTACH CHILD PANEL TO REQUEST
    ====================================================
    */
    if (childPanel) {
      req.childPanel = childPanel;

      req.brand = {
        brandName:
          childPanel.childPanelBrandName ||
          childPanel.childPanelSlug,

        logo: childPanel.childPanelLogo || null,

        themeColor:
          childPanel.childPanelThemeColor || "#1e40af",

        domain:
          childPanel.childPanelDomain ||
          `${childPanel.childPanelSlug}.${BASE_DOMAIN}`,

        supportWhatsapp:
          childPanel.childPanelSupportWhatsapp || "",

        supportTelegram:
          childPanel.childPanelSupportTelegram || "",

        supportWhatsappChannel:
          childPanel.childPanelSupportWhatsappChannel || "",
      };
    }

    next();
  } catch (error) {
    console.error(
      "Child panel domain detection error:",
      error
    );

    next();
  }
};

/*
====================================================
ONLY ALLOW ACCESS FROM CHILD PANEL DOMAIN
====================================================
*/
export const childPanelOnly = (req, res, next) => {
  if (!req.childPanel) {
    return res.status(403).json({
      success: false,
      message: "Access denied: Child panel only route",
    });
  }

  next();
};

/*
====================================================
ONLY ALLOW CHILD PANEL OWNERS
====================================================
*/
export const cpOwnerOnly = (req, res, next) => {
  try {
    const user = req.user;

    /*
    -----------------------------
    CHECK AUTH
    -----------------------------
    */
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Not authorized",
      });
    }

    /*
    -----------------------------
    CHECK CHILD PANEL OWNER
    -----------------------------
    */
    if (!user.isChildPanel) {
      console.log(
        "cpOwnerOnly FAIL — isChildPanel:",
        user.isChildPanel,
        "userId:",
        user._id
      );

      return res.status(403).json({
        success: false,
        message: "Access denied: Child panel owners only",
      });
    }

    /*
    -----------------------------
    CHECK ACTIVE STATUS
    -----------------------------
    */
    if (!user.childPanelIsActive) {
      console.log(
        "cpOwnerOnly FAIL — childPanelIsActive:",
        user.childPanelIsActive,
        "userId:",
        user._id
      );

      return res.status(403).json({
        success: false,
        message: "Child panel is inactive",
      });
    }

    /*
    -----------------------------
    CHECK SUBSCRIPTION EXPIRY
    -----------------------------
    */
    if (
      user.childPanelNextBilledAt &&
      new Date() > new Date(user.childPanelNextBilledAt)
    ) {
      console.log(
        "cpOwnerOnly FAIL — subscription expired:",
        user.childPanelNextBilledAt,
        "userId:",
        user._id
      );

      return res.status(403).json({
        success: false,
        message: "Child panel subscription expired",
      });
    }

    next();
  } catch (error) {
    console.error("cpOwnerOnly middleware error:", error);

    return res.status(500).json({
      success: false,
      message: "Server error in cpOwnerOnly middleware",
    });
  }
};
