// controllers/brandingController.js
import User from "../models/User.js";

/*
========================================
PUBLIC BRANDING (DOMAIN-BASED)
========================================
Used for:
- Landing pages
- End users
- White-labeled domains

DOES NOT depend on logged-in user
*/
export const getPublicBranding = async (req, res) => {
  try {
    if (req.brand) {
      return res.json({
        brandName: req.brand.brandName || "Reseller Panel",
        logo: req.brand.logo || null,
        themeColor: req.brand.themeColor || "#16a34a",
        domain: req.brand.domain || null,
      });
    }

    // Default platform branding
    return res.json({
      brandName: "MarinePanel",
      logo: null,
      themeColor: "#f97316",
      domain: "marinepanel.online",
    });

  } catch (error) {
    console.error("Public Branding error:", error);
    res.status(500).json({ message: "Branding load failed" });
  }
};


/*
========================================
DASHBOARD BRANDING (USER-BASED)
========================================
Used for:
- Reseller dashboard
- Branding settings page

ALWAYS tied to logged-in user
*/
export const getDashboardBranding = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // If reseller → return THEIR branding
    if (req.user.isReseller) {
      return res.json({
        brandName: req.user.brandName || "Reseller Panel",
        logo: req.user.logo || null,
        themeColor: req.user.themeColor || "#16a34a",
        domain: req.user.resellerDomain || null,
      });
    }

    // Non-reseller fallback (admin or normal user)
    return res.json({
      brandName: "MarinePanel",
      logo: null,
      themeColor: "#f97316",
      domain: "marinepanel.online",
    });

  } catch (error) {
    console.error("Dashboard Branding error:", error);
    res.status(500).json({ message: "Branding load failed" });
  }
};


/*
========================================
UPDATE BRANDING (RESELLER ONLY)
========================================
This is what fixes your "resets on refresh" issue:
We UPDATE USER DATA (single source of truth)
*/
export const updateBranding = async (req, res) => {
  try {
    if (!req.user || !req.user.isReseller) {
      return res.status(403).json({ message: "Access denied" });
    }

    const { brandName, themeColor, logo } = req.body;

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      {
        brandName,
        themeColor,
        logo,
      },
      { new: true }
    );

    return res.json({
      message: "Branding updated successfully",
      branding: {
        brandName: updatedUser.brandName,
        themeColor: updatedUser.themeColor,
        logo: updatedUser.logo,
        domain: updatedUser.resellerDomain,
      },
    });

  } catch (error) {
    console.error("Update Branding error:", error);
    res.status(500).json({ message: "Failed to update branding" });
  }
};
