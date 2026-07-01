// middleware/childPanelMiddleware.js

import User from "../models/User.js";

const BASE_DOMAIN = "marinepanel.online";

export const detectChildPanelDomain = async (req, res, next) => {
  try {
    let host =
      req.headers["x-childpanel-domain"] ||
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

// For end-users accessing via a child panel domain
export const childPanelOnly = (req, res, next) => {
  if (!req.childPanel) {
    return res.status(403).json({
      message: "Access denied: Child panel only route",
    });
  }

  next();
};

// For the child panel OWNER managing their panel from the main platform
export const cpOwnerOnly = async (req, res, next) => {
  const user = req.user;

  if (!user) {
    return res.status(401).json({ message: "Not authorized" });
  }

  if (!user.isChildPanel && !user.isCpAdmin) {
    return res.status(403).json({ message: "Access denied: Child panel owners only" });
  }

  // For a CP admin (promoted end user), load the actual panel owner
  // to run billing/suspension checks against the real panel, not the sub-admin
  let panelOwner = user;
  if (user.isCpAdmin && !user.isChildPanel) {
    if (!user.childPanelOwner) {
      return res.status(403).json({ message: "Access denied: No panel associated" });
    }
    panelOwner = await User.findById(user.childPanelOwner);
    if (!panelOwner || !panelOwner.isChildPanel) {
      return res.status(403).json({ message: "Access denied: Panel owner not found" });
    }
  }

  // Subscription expiry check
  if (
    panelOwner.childPanelNextBilledAt &&
    new Date() > new Date(panelOwner.childPanelNextBilledAt) &&
    !panelOwner.childPanelSubscriptionSuspended
  ) {
    panelOwner.childPanelSubscriptionSuspended = true;
    panelOwner.childPanelIsActive = false;
    panelOwner.childPanelSuspendReason =
      "Subscription expired — please contact the platform admin to renew your plan.";
    await panelOwner.save();

    return res.status(403).json({
      code: "SUBSCRIPTION_EXPIRED",
      message: panelOwner.childPanelSuspendReason,
      expiredAt: panelOwner.childPanelNextBilledAt,
    });
  }

  if (!panelOwner.childPanelIsActive) {
    return res.status(403).json({
      code: "PANEL_SUSPENDED",
      message: panelOwner.childPanelSuspendReason || "Your panel has been suspended. Contact support.",
    });
  }

  // Attach the panel owner as req.childPanel so controllers can use it
  req.childPanel = panelOwner;
  next();
};
