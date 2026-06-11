// config/cloudinary.js  (NEW FILE)
import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import multer from "multer";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ── Logo Gallery storage (admin uploads — public preset) ────────
export const galleryStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder:         "marinepanel/logo-gallery",
    allowed_formats: ["jpg", "jpeg", "png", "svg", "webp"],
    transformation: [{ width: 400, height: 400, crop: "limit" }],
  },
});

// ── Reseller / CP Owner logo storage ───────────────────────────
export const brandLogoStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req) => ({
    folder: `marinepanel/brands/${req.user?._id || "misc"}`,
    allowed_formats: ["jpg", "jpeg", "png", "svg", "webp"],
    transformation: [{ width: 400, height: 400, crop: "limit" }],
  }),
});

// ── SEO og:image / favicon storage ─────────────────────────────
export const seoImageStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req) => ({
    folder: `marinepanel/seo/${req.user?._id || "main"}`,
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
    transformation: [{ width: 1200, height: 630, crop: "limit" }],
  }),
});

export const uploadGallery    = multer({ storage: galleryStorage });
export const uploadBrandLogo  = multer({ storage: brandLogoStorage });
export const uploadSeoImage   = multer({ storage: seoImageStorage });

export { cloudinary };
