import User from "../models/User.js";

/*
----------------------------------------------------------------
ADMIN ONLY
----------------------------------------------------------------
*/
export const adminOnly = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user || !user.isAdmin) {
      return res.status(403).json({
        message: "Access denied. Admins only.",
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("adminOnly error:", error);

    return res.status(500).json({
      message: "Server error",
    });
  }
};

/*
----------------------------------------------------------------
CHILD PANEL OWNER ONLY
Protects routes that only a child panel owner can access.
Used on all /api/child-panel/* routes.
----------------------------------------------------------------
*/
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
/*
----------------------------------------------------------------
CHILD PANEL OR ADMIN
Allows both main admin and child panel owners.
Useful for shared routes like branding, services, payments
where both roles need access but with different scopes.
----------------------------------------------------------------
*/
export const childPanelOrAdmin = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(403).json({
        message: "Access denied.",
      });
    }

    // Main platform admin
    if (user.isAdmin) {
      req.user = user;
      return next();
    }

    // Active child panel owner
    if (user.isChildPanel && user.childPanelIsActive) {
      if (
        user.childPanelNextBilledAt &&
        new Date() > new Date(user.childPanelNextBilledAt)
      ) {
        return res.status(403).json({
          code: "SUBSCRIPTION_EXPIRED",
          message:
            "Your subscription has expired. Please contact the platform admin to renew your plan.",
          expiredAt: user.childPanelNextBilledAt,
        });
      }

      req.user = user;
      return next();
    }

    return res.status(403).json({
      message: "Access denied. Admins or child panel owners only.",
    });
  } catch (error) {
    console.error("childPanelOrAdmin error:", error);

    return res.status(500).json({
      message: "Server error",
    });
  }
};
