// controllers/brandingController.js

import User from "../models/User.js";
import Settings from "../models/Settings.js";

/*
========================================
PUBLIC BRANDING (DOMAIN-BASED)
========================================
*/
export const getPublicBranding = async (req, res) => {
  try {
    const settings = await Settings.findOne().lean();

    if (req.brand && req.reseller) {
      return res.json({
        brandName: req.brand.brandName || "Reseller Panel",
        logo: req.brand.logo || null,
        themeColor: req.brand.themeColor || "#16a34a",
        domain: req.brand.domain || null,
        support: {
          // ✅ FALLBACK ADDED
          whatsapp:
            req.reseller.supportWhatsapp ||
            settings?.supportWhatsapp ||
            "",
          telegram:
            req.reseller.supportTelegram ||
            settings?.supportTelegram ||
            "",
          whatsappChannel:
            req.reseller.supportWhatsappChannel ||
            settings?.supportWhatsappChannel ||
            "",
        },
      });
    }

    return res.json({
      brandName: "MarinePanel",
      logo: null,
      themeColor: "#f97316",
      domain: "marinepanel.online",
      support: {
        whatsapp: settings?.supportWhatsapp || "",
        telegram: settings?.supportTelegram || "",
        whatsappChannel: settings?.supportWhatsappChannel || "",
      },
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
*/
export const getDashboardBranding = async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });

    const settings = await Settings.findOne().lean();

    // Reseller dashboard
    if (req.user.isReseller) {
      return res.json({
        brandName: req.user.brandName || "Reseller Panel",
        logo: req.user.logo || null,
        themeColor: req.user.themeColor || "#16a34a",
        domain: req.user.resellerDomain || null,
        support: {
          // ✅ FALLBACK ADDED
          whatsapp:
            req.user.supportWhatsapp ||
            settings?.supportWhatsapp ||
            "",
          telegram:
            req.user.supportTelegram ||
            settings?.supportTelegram ||
            "",
          whatsappChannel:
            req.user.supportWhatsappChannel ||
            settings?.supportWhatsappChannel ||
            "",
        },
      });
    }

    // Users under reseller
    if (req.user.resellerOwner) {
      const reseller = await User.findById(req.user.resellerOwner).lean();

      if (reseller) {
        return res.json({
          brandName: reseller.brandName || "Reseller Panel",
          logo: reseller.logo || null,
          themeColor: reseller.themeColor || "#16a34a",
          domain: reseller.resellerDomain || null,
          support: {
            // ✅ FALLBACK ADDED
            whatsapp:
              reseller.supportWhatsapp ||
              settings?.supportWhatsapp ||
              "",
            telegram:
              reseller.supportTelegram ||
              settings?.supportTelegram ||
              "",
            whatsappChannel:
              reseller.supportWhatsappChannel ||
              settings?.supportWhatsappChannel ||
              "",
          },
        });
      }
    }

    // Admin / normal user
    return res.json({
      brandName: "MarinePanel",
      logo: null,
      themeColor: "#f97316",
      domain: "marinepanel.online",
      support: {
        whatsapp: settings?.supportWhatsapp || "",
        telegram: settings?.supportTelegram || "",
        whatsappChannel: settings?.supportWhatsappChannel || "",
      },
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
*/
export const updateBranding = async (req, res) => {
  try {
    if (!req.user || !req.user.isReseller) {
      return res.status(403).json({ message: "Access denied" });
    }

    const {
      brandName,
      themeColor,
      logo,
      supportWhatsapp,
      supportTelegram,
      supportWhatsappChannel,
    } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found" });

    /*
    --------------------------------
    BASIC BRANDING
    --------------------------------
    */
    if (brandName !== undefined) user.brandName = brandName;
    if (themeColor !== undefined) user.themeColor = themeColor;
    if (logo !== undefined) user.logo = logo;

    /*
    --------------------------------
    ✅ SUPPORT NORMALIZATION (UNCHANGED)
    --------------------------------
    */

    // WhatsApp (number OR link)
    if (supportWhatsapp !== undefined) {
      let value = supportWhatsapp.trim();

      if (value && value.includes("wa.me") && !value.startsWith("http")) {
        value = "https://" + value;
      }

      if (value && !value.startsWith("http")) {
        value = value.replace(/\D/g, "");
      }

      user.supportWhatsapp = value;
    }

    // Telegram (username OR link)
    if (supportTelegram !== undefined) {
      let value = supportTelegram.trim();

      if (
        value &&
        !value.startsWith("http") &&
        !value.startsWith("@")
      ) {
        value = "@" + value;
      }

      user.supportTelegram = value;
    }

    // WhatsApp Channel / Group / Invite
    if (supportWhatsappChannel !== undefined) {
      let value = supportWhatsappChannel.trim();

      if (value && !value.startsWith("http")) {
        value = "https://" + value;
      }

      user.supportWhatsappChannel = value;
    }

    /*
    --------------------------------
    SAVE
    --------------------------------
    */
    await user.save();

    return res.json({
      message: "Branding updated successfully",
      branding: {
        brandName: user.brandName,
        logo: user.logo,
        themeColor: user.themeColor,
        domain: user.resellerDomain,
        support: {
          whatsapp: user.supportWhatsapp || "",
          telegram: user.supportTelegram || "",
          whatsappChannel: user.supportWhatsappChannel || "",
        },
      },
    });
  } catch (error) {
    console.error("Update Branding error:", error);

    if (error.name === "ValidationError") {
      return res.status(400).json({
        message: Object.values(error.errors)
          .map((e) => e.message)
          .join(", "),
      });
    }

    res.status(500).json({ message: "Failed to update branding" });
  }
};
