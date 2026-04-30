import User from "../models/User.js";

// Check if logged-in user is admin
export const adminOnly = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user || !user.isAdmin) {
      return res.status(403).json({ message: "Access denied. Admins only." });
    }
    next();
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

/*
----------------------------------------------------------------
CHILD PANEL OWNER ONLY
Protects routes that only a child panel owner can access.
Used on all /api/child-panel/* routes.
----------------------------------------------------------------
*/
export const childPanelOnly = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user || !user.isChildPanel) {
      return res.status(403).json({
        message: "Access denied. Child panel owners only.",
      });
    }

    if (!user.childPanelIsActive) {
      return res.status(403).json({
        message: "Your panel has been suspended. Contact support.",
      });
    }

    next();
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
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
      return res.status(403).json({ message: "Access denied." });
    }

    if (user.isAdmin) return next();

    if (user.isChildPanel && user.childPanelIsActive) return next();

    return res.status(403).json({
      message: "Access denied. Admins or child panel owners only.",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};
