// controllers/seoController.js

import Settings from "../models/Settings.js";
import User     from "../models/User.js";
import { cloudinary } from "../config/cloudinary.js";
import logAdminAction from "../utils/logAdminAction.js";

// ====================================================================
// SHARED HELPER — resolves brand/SEO data based on req.childPanel /
// req.brand (set by detectChildPanelDomain / detectResellerDomain)
// Used by getCrawlerHtml (OG previews) and renderSeoHtml (bot SEO)
// ====================================================================
const resolveBrandSeo = async (req) => {
  if (req.childPanel) {
    const cp  = req.childPanel;
    const seo = cp.childPanelSeo || {};
    return {
      brandName:   cp.childPanelBrandName || "Panel",
      title:       seo.title       || cp.childPanelBrandName || "Panel",
      description: seo.description || "Fast & affordable SMM panel services.",
      image:       seo.ogImage     || cp.childPanelLogo || "",
      url:         seo.canonical   || `https://${cp.childPanelDomain || req.headers.host}`,
    };
  }

  if (req.brand) {
    const r   = req.brand;
    const seo = r.resellerSeo || {};
    return {
      brandName:   r.brandName || "Reseller Panel",
      title:       seo.title       || r.brandName || "Reseller Panel",
      description: seo.description || "Fast & affordable SMM panel services.",
      image:       seo.ogImage     || r.logo || "",
      url:         seo.canonical   || `https://${r.domain || req.headers.host}`,
    };
  }

  const settings = await Settings.findOne().lean();
  const seo      = settings?.seo || {};
  return {
    brandName:   "MarinePanel",
    title:       seo.title       || "Marine Panel – #1 Cheap & Fast SMM Panel",
    description: seo.description || "Buy Instagram followers, TikTok views and YouTube subscribers at the best prices.",
    image:       seo.ogImage     || settings?.mainLogo || "",
    url:         seo.canonical   || "https://marinepanel.online/",
  };
};

// ====================================================================
// PUBLIC — fetch SEO data based on domain (used by frontend useSEO hook)
// Reads req.brand (reseller) / req.childPanel (cp owner) / fallback = main
// ====================================================================
export const getPublicSeo = async (req, res) => {
  try {
    // ── Child Panel domain ──────────────────────────────────────
    if (req.childPanel) {
      const cp = req.childPanel;
      const seo = cp.childPanelSeo || {};
      return res.json({
        panelType:   "childPanel",
        brandName:   cp.childPanelBrandName || "Panel",
        logo:        cp.childPanelLogo      || "",
        favicon:     seo.favicon            || cp.childPanelLogo || "",
        themeColor:  cp.childPanelThemeColor || "#1e40af",
        seo: {
          title:       seo.title       || cp.childPanelBrandName || "SMM Panel",
          description: seo.description || "Fast & cheap SMM panel services.",
          keywords:    seo.keywords    || "smm panel",
          ogImage:     seo.ogImage     || cp.childPanelLogo || "",
          twitterCard: seo.twitterCard || "summary_large_image",
          canonical:   seo.canonical   || "",
        },
      });
    }

    // ── Reseller domain ─────────────────────────────────────────
    if (req.brand) {
      const r   = req.brand;
      const seo = r.resellerSeo || {};
      return res.json({
        panelType:  "reseller",
        brandName:  r.brandName  || "Reseller Panel",
        logo:       r.logo       || "",
        favicon:    seo.favicon  || r.logo || "",
        themeColor: r.themeColor || "#16a34a",
        seo: {
          title:       seo.title       || r.brandName || "SMM Reseller Panel",
          description: seo.description || "Fast & affordable SMM services.",
          keywords:    seo.keywords    || "smm panel, reseller panel",
          ogImage:     seo.ogImage     || r.logo || "",
          twitterCard: seo.twitterCard || "summary_large_image",
          canonical:   seo.canonical   || "",
        },
      });
    }

    // ── Main Panel (MarinePanel — brand hardcoded) ───────────────
    const settings = await Settings.findOne().lean();
    const seo      = settings?.seo || {};

    return res.json({
      panelType:  "main",
      brandName:  "MarinePanel",                          // ← HARDCODED — never changes
      logo:       settings?.mainLogo || "",
      favicon:    seo.favicon || "",
      themeColor: "#f97316",
      seo: {
        title:       seo.title       || "Marine Panel – #1 Cheap & Fast SMM Panel",
        description: seo.description || "Buy Instagram followers, TikTok views and YouTube subscribers at the best prices.",
        keywords:    seo.keywords    || "cheap smm panel, best smm panel",
        ogImage:     seo.ogImage     || "",
        twitterCard: seo.twitterCard || "summary_large_image",
        canonical:   seo.canonical   || "https://marinepanel.online/",
        schemaOrg:   seo.schemaOrg   || {},
      },
    });
  } catch (err) {
    console.error("getPublicSeo error:", err);
    res.status(500).json({ message: "Failed to load SEO" });
  }
};

// ====================================================================
// ADMIN — get main panel SEO
// ====================================================================
export const getAdminSeo = async (req, res) => {
  try {
    const settings = await Settings.findOne().lean();
    res.json({
      seo:         settings?.seo         || {},
      logoGallery: settings?.logoGallery || [],
      mainLogo:    settings?.mainLogo    || "",
      favicon:     settings?.seo?.favicon || "",
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch admin SEO" });
  }
};

// ====================================================================
// ADMIN — update main panel SEO
// ====================================================================
export const updateAdminSeo = async (req, res) => {
  try {
    const { title, description, keywords, twitterCard, canonical, schemaOrg } = req.body;

    const settings = await Settings.findOne() || await Settings.create({});
    if (!settings.seo) settings.seo = {};

    if (title       !== undefined) settings.seo.title       = title;
    if (description !== undefined) settings.seo.description = description;
    if (keywords    !== undefined) settings.seo.keywords    = keywords;
    if (twitterCard !== undefined) settings.seo.twitterCard = twitterCard;
    if (canonical   !== undefined) settings.seo.canonical   = canonical;
    if (schemaOrg   !== undefined) settings.seo.schemaOrg   = { ...settings.seo.schemaOrg, ...schemaOrg };

    settings.markModified("seo");
    await settings.save();

    await logAdminAction({
      adminId:    req.user._id,
      adminEmail: req.user.email,
      action:     "UPDATE_SEO",
      description:"Updated main panel SEO settings",
      ipAddress:  req.ip,
    });

    res.json({ message: "SEO updated", seo: settings.seo });
  } catch (err) {
    console.error("updateAdminSeo error:", err);
    res.status(500).json({ message: "Failed to update SEO" });
  }
};

// ====================================================================
// ADMIN — upload og:image or favicon for main panel
// ====================================================================
export const uploadAdminSeoImage = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No image uploaded" });
    const { type } = req.query; // "ogImage" | "favicon"

    const settings = await Settings.findOne() || await Settings.create({});
    if (!settings.seo) settings.seo = {};

    // Delete old Cloudinary image if exists
    const oldPublicId = settings.seo[`${type}PublicId`];
    if (oldPublicId) {
      await cloudinary.uploader.destroy(oldPublicId).catch(() => {});
    }

    settings.seo[type]              = req.file.path;          // Cloudinary URL
    settings.seo[`${type}PublicId`] = req.file.filename;      // public_id for future deletion
    settings.markModified("seo");
    await settings.save();

    res.json({ message: "SEO image uploaded", url: req.file.path });
  } catch (err) {
    console.error("uploadAdminSeoImage error:", err);
    res.status(500).json({ message: "Upload failed" });
  }
};

// ====================================================================
// ADMIN — upload main panel logo
// ====================================================================
export const uploadMainLogo = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No image uploaded" });

    const settings = await Settings.findOne() || await Settings.create({});

    // Delete old logo from Cloudinary
    if (settings.mainLogoPublicId) {
      await cloudinary.uploader.destroy(settings.mainLogoPublicId).catch(() => {});
    }

    settings.mainLogo          = req.file.path;
    settings.mainLogoPublicId  = req.file.filename;
    await settings.save();

    res.json({ message: "Main logo uploaded", url: req.file.path });
  } catch (err) {
    res.status(500).json({ message: "Upload failed" });
  }
};

// ====================================================================
// ADMIN — Logo Gallery: upload image to gallery
// ====================================================================
export const uploadToGallery = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No image uploaded" });

    const { label } = req.body;
    const settings  = await Settings.findOne() || await Settings.create({});

    settings.logoGallery.push({
      url:      req.file.path,
      publicId: req.file.filename,
      label:    label || "",
    });

    await settings.save();

    await logAdminAction({
      adminId:    req.user._id,
      adminEmail: req.user.email,
      action:     "GALLERY_UPLOAD",
      description:`Uploaded logo to gallery: ${req.file.path}`,
      ipAddress:  req.ip,
    });

    res.json({
      message: "Logo added to gallery",
      logo: settings.logoGallery[settings.logoGallery.length - 1],
    });
  } catch (err) {
    console.error("uploadToGallery error:", err);
    res.status(500).json({ message: "Gallery upload failed" });
  }
};

// ====================================================================
// ADMIN — Logo Gallery: delete image from gallery
// ====================================================================
export const deleteFromGallery = async (req, res) => {
  try {
    const { id } = req.params; // gallery item _id

    const settings = await Settings.findOne();
    if (!settings) return res.status(404).json({ message: "Settings not found" });

    const item = settings.logoGallery.id(id);
    if (!item) return res.status(404).json({ message: "Gallery item not found" });

    // Delete from Cloudinary
    await cloudinary.uploader.destroy(item.publicId).catch(() => {});

    item.deleteOne();
    await settings.save();

    res.json({ message: "Gallery item deleted" });
  } catch (err) {
    res.status(500).json({ message: "Delete failed" });
  }
};

// ====================================================================
// PUBLIC — get logo gallery (for resellers & CP owners to pick from)
// ====================================================================
export const getLogoGallery = async (req, res) => {
  try {
    const settings = await Settings.findOne().lean();
    res.json({ gallery: settings?.logoGallery || [] });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch gallery" });
  }
};

// ====================================================================
// RESELLER — update reseller SEO
// ====================================================================
export const updateResellerSeo = async (req, res) => {
  try {
    if (!req.user?.isReseller) return res.status(403).json({ message: "Access denied" });

    const { title, description, keywords, twitterCard, canonical } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (!user.resellerSeo) user.resellerSeo = {};
    if (title       !== undefined) user.resellerSeo.title       = title;
    if (description !== undefined) user.resellerSeo.description = description;
    if (keywords    !== undefined) user.resellerSeo.keywords    = keywords;
    if (twitterCard !== undefined) user.resellerSeo.twitterCard = twitterCard;
    if (canonical   !== undefined) user.resellerSeo.canonical   = canonical;

    user.markModified("resellerSeo");
    await user.save();

    res.json({ message: "SEO updated", seo: user.resellerSeo });
  } catch (err) {
    res.status(500).json({ message: "Failed to update SEO" });
  }
};

// ====================================================================
// RESELLER — upload brand logo (direct upload to Cloudinary)
// ====================================================================
export const uploadResellerLogo = async (req, res) => {
  try {
    if (!req.user?.isReseller) return res.status(403).json({ message: "Access denied" });
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    const user = await User.findById(req.user._id);

    // Delete old logo
    if (user.logoPublicId) {
      await cloudinary.uploader.destroy(user.logoPublicId).catch(() => {});
    }

    user.logo          = req.file.path;
    user.logoPublicId  = req.file.filename;
    await user.save();

    res.json({ message: "Logo uploaded", url: req.file.path });
  } catch (err) {
    res.status(500).json({ message: "Upload failed" });
  }
};

// ====================================================================
// RESELLER — upload SEO og:image or favicon
// ====================================================================
export const uploadResellerSeoImage = async (req, res) => {
  try {
    if (!req.user?.isReseller) return res.status(403).json({ message: "Access denied" });
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    const { type } = req.query; // "ogImage" | "favicon"
    const user = await User.findById(req.user._id);

    if (!user.resellerSeo) user.resellerSeo = {};
    const oldPublicId = user.resellerSeo[`${type}PublicId`];
    if (oldPublicId) await cloudinary.uploader.destroy(oldPublicId).catch(() => {});

    user.resellerSeo[type]              = req.file.path;
    user.resellerSeo[`${type}PublicId`] = req.file.filename;
    user.markModified("resellerSeo");
    await user.save();

    res.json({ message: "SEO image uploaded", url: req.file.path });
  } catch (err) {
    res.status(500).json({ message: "Upload failed" });
  }
};

// ====================================================================
// CP OWNER — update child panel SEO
// ====================================================================
export const updateCpOwnerSeo = async (req, res) => {
  try {
    if (!req.user?.isChildPanel) return res.status(403).json({ message: "Access denied" });

    const { title, description, keywords, twitterCard, canonical } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (!user.childPanelSeo) user.childPanelSeo = {};
    if (title       !== undefined) user.childPanelSeo.title       = title;
    if (description !== undefined) user.childPanelSeo.description = description;
    if (keywords    !== undefined) user.childPanelSeo.keywords    = keywords;
    if (twitterCard !== undefined) user.childPanelSeo.twitterCard = twitterCard;
    if (canonical   !== undefined) user.childPanelSeo.canonical   = canonical;

    user.markModified("childPanelSeo");
    await user.save();

    res.json({ message: "SEO updated", seo: user.childPanelSeo });
  } catch (err) {
    res.status(500).json({ message: "Failed to update SEO" });
  }
};

// ====================================================================
// CP OWNER — upload child panel logo (direct upload)
// ====================================================================
export const uploadCpOwnerLogo = async (req, res) => {
  try {
    if (!req.user?.isChildPanel) return res.status(403).json({ message: "Access denied" });
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    const user = await User.findById(req.user._id);

    if (user.childPanelLogoPublicId) {
      await cloudinary.uploader.destroy(user.childPanelLogoPublicId).catch(() => {});
    }

    user.childPanelLogo          = req.file.path;
    user.childPanelLogoPublicId  = req.file.filename;
    await user.save();

    res.json({ message: "Logo uploaded", url: req.file.path });
  } catch (err) {
    res.status(500).json({ message: "Upload failed" });
  }
};

// ====================================================================
// CP OWNER — upload SEO og:image or favicon
// ====================================================================
export const uploadCpOwnerSeoImage = async (req, res) => {
  try {
    if (!req.user?.isChildPanel) return res.status(403).json({ message: "Access denied" });
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    const { type } = req.query;
    const user = await User.findById(req.user._id);

    if (!user.childPanelSeo) user.childPanelSeo = {};
    const oldPublicId = user.childPanelSeo[`${type}PublicId`];
    if (oldPublicId) await cloudinary.uploader.destroy(oldPublicId).catch(() => {});

    user.childPanelSeo[type]              = req.file.path;
    user.childPanelSeo[`${type}PublicId`] = req.file.filename;
    user.markModified("childPanelSeo");
    await user.save();

    res.json({ message: "SEO image uploaded", url: req.file.path });
  } catch (err) {
    res.status(500).json({ message: "Upload failed" });
  }
};

// ====================================================================
// RESELLER — get reseller SEO (for loading the form)
// ====================================================================
export const getResellerSeo = async (req, res) => {
  try {
    if (!req.user?.isReseller) return res.status(403).json({ message: "Access denied" });
    const user = await User.findById(req.user._id).lean();
    res.json({ seo: user?.resellerSeo || {} });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch SEO" });
  }
};

// ====================================================================
// CP OWNER — get own child panel SEO (for loading the dashboard form)
// ====================================================================
export const getCpOwnerSeo = async (req, res) => {
  try {
    if (!req.user?.isChildPanel) return res.status(403).json({ message: "Access denied" });
    const user = await User.findById(req.user._id).lean();
    res.json({ seo: user?.childPanelSeo || {} });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch SEO" });
  }
};

// ====================================================================
// CRAWLER HTML — minimal HTML w/ OG meta + redirect, for link-unfurl
// bots (WhatsApp/Facebook/Telegram) that just need a preview card and
// then bounce. NOT used for search-engine indexing — see renderSeoHtml.
// ====================================================================
export const getCrawlerHtml = async (req, res) => {
  try {
    const { title, description, image, url } = await resolveBrandSeo(req);

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>${title}</title>
  <meta name="description" content="${description}" />
  <meta property="og:type"        content="website" />
  <meta property="og:title"       content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:url"         content="${url}" />
  ${image ? `<meta property="og:image" content="${image}" />` : ""}
  <meta name="twitter:card"        content="summary_large_image" />
  <meta name="twitter:title"       content="${title}" />
  <meta name="twitter:description" content="${description}" />
  ${image ? `<meta name="twitter:image" content="${image}" />` : ""}
  <meta http-equiv="refresh" content="0;url=${url}" />
</head>
<body>Redirecting...</body>
</html>`;

    res.setHeader("Content-Type", "text/html");
    res.send(html);
  } catch (err) {
    console.error("getCrawlerHtml error:", err);
    res.status(500).send("Error");
  }
};

// ====================================================================
// SEO RENDER — full crawlable HTML for search/AI bots (Googlebot,
// Bingbot, GPTBot, PerplexityBot, etc.) that DON'T execute JS.
// Hit by Vercel Routing Middleware, not by real visitors.
// No redirect — bots need to actually read the content to index it.
// ====================================================================
const NOINDEX_PATHS = ["/login", "/register", "/dashboard", "/admin", "/forgot-password", "/reset-password"];

export const renderSeoHtml = async (req, res) => {
  try {
    const path     = req.query.path || "/";
    const noindex  = NOINDEX_PATHS.some((p) => path.startsWith(p));
    const { title, description, image, url, brandName } = await resolveBrandSeo(req);

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${title}</title>
  <meta name="description" content="${description}" />
  ${noindex ? `<meta name="robots" content="noindex,nofollow" />` : ""}
  <meta property="og:type"        content="website" />
  <meta property="og:title"       content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:url"         content="${url}" />
  ${image ? `<meta property="og:image" content="${image}" />` : ""}
  <link rel="canonical" href="${url}" />
</head>
<body>
  <h1>${title}</h1>
  <p>${description}</p>
  <nav>
    <a href="/">Home</a>
    <a href="/services">Services</a>
    <a href="/pricing">Pricing</a>
    <a href="/login">Sign In</a>
    <a href="/register">Create Account</a>
  </nav>
  <p>${brandName} offers automated social media marketing services — likes, followers, views, and more — with instant delivery and secure payments.</p>
</body>
</html>`;

    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=600");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (err) {
    console.error("renderSeoHtml error:", err);
    res.status(500).send("Error");
  }
};
