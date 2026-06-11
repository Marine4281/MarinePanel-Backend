// routes/seoRoutes.js  (NEW FILE)

import express from "express";
import { protect }             from "../middlewares/authMiddleware.js";
import { isAdmin }             from "../middlewares/adminMiddleware.js";
import { detectResellerDomain } from "../middlewares/resellerDomainMiddleware.js";
import { detectChildPanelDomain } from "../middlewares/childPanelMiddleware.js";
import {
  uploadGallery,
  uploadBrandLogo,
  uploadSeoImage,
} from "../config/cloudinary.js";
import {
  getPublicSeo,
  getAdminSeo,
  updateAdminSeo,
  uploadAdminSeoImage,
  uploadMainLogo,
  uploadToGallery,
  deleteFromGallery,
  getLogoGallery,
  updateResellerSeo,
  uploadResellerLogo,
  uploadResellerSeoImage,
  updateCpOwnerSeo,
  uploadCpOwnerLogo,
  uploadCpOwnerSeoImage,
} from "../controllers/seoController.js";

const router = express.Router();

// ── PUBLIC ──────────────────────────────────────────────────────
// Called by frontend useSEO hook on every page load
router.get("/public", detectResellerDomain, detectChildPanelDomain, getPublicSeo);

// Gallery (resellers & cp owners fetch this to pick a logo)
router.get("/gallery", getLogoGallery);

// ── ADMIN ───────────────────────────────────────────────────────
router.get(   "/admin",                   protect, isAdmin, getAdminSeo);
router.patch( "/admin",                   protect, isAdmin, updateAdminSeo);
router.post(  "/admin/logo",              protect, isAdmin, uploadGallery.single("image"),   uploadMainLogo);
router.post(  "/admin/seo-image",         protect, isAdmin, uploadSeoImage.single("image"),  uploadAdminSeoImage);
router.post(  "/admin/gallery",           protect, isAdmin, uploadGallery.single("image"),   uploadToGallery);
router.delete("/admin/gallery/:id",       protect, isAdmin, deleteFromGallery);

// ── RESELLER ─────────────────────────────────────────────────────
router.patch("/reseller",                 protect, updateResellerSeo);
router.post( "/reseller/logo",            protect, uploadBrandLogo.single("image"),  uploadResellerLogo);
router.post( "/reseller/seo-image",       protect, uploadSeoImage.single("image"),   uploadResellerSeoImage);

// ── CHILD PANEL OWNER ────────────────────────────────────────────
router.patch("/cp",                       protect, updateCpOwnerSeo);
router.post( "/cp/logo",                  protect, uploadBrandLogo.single("image"),  uploadCpOwnerLogo);
router.post( "/cp/seo-image",             protect, uploadSeoImage.single("image"),   uploadCpOwnerSeoImage);

export default router;
