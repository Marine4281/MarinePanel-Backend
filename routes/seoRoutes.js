// routes/seoRoutes.js

import express from "express";
import { protect }             from "../middlewares/authMiddleware.js";
import { adminOnly }             from "../middlewares/adminMiddleware.js";
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
  getResellerSeo,
} from "../controllers/seoController.js";

const router = express.Router();

// ── PUBLIC ──────────────────────────────────────────────────────
// Called by frontend useSEO hook on every page load
router.get("/public", detectResellerDomain, detectChildPanelDomain, getPublicSeo);

// Gallery (resellers & cp owners fetch this to pick a logo)
router.get("/gallery", getLogoGallery);

// ── ADMIN ───────────────────────────────────────────────────────
router.get(   "/admin",                   protect, adminOnly, getAdminSeo);
router.patch( "/admin",                   protect, adminOnly, updateAdminSeo);
router.post(  "/admin/logo",              protect, adminOnly, uploadGallery.single("image"),   uploadMainLogo);
router.post(  "/admin/seo-image",         protect, adminOnly, uploadSeoImage.single("image"),  uploadAdminSeoImage);
router.post(  "/admin/gallery",           protect, adminOnly, uploadGallery.single("image"),   uploadToGallery);
router.delete("/admin/gallery/:id",       protect, adminOnly, deleteFromGallery);

// ── RESELLER ─────────────────────────────────────────────────────
router.patch("/reseller",                 protect, updateResellerSeo);
router.post( "/reseller/logo",            protect, uploadBrandLogo.single("image"),  uploadResellerLogo);
router.post( "/reseller/seo-image",       protect, uploadSeoImage.single("image"),   uploadResellerSeoImage);
router.get("/reseller", protect, getResellerSeo);

// ── CHILD PANEL OWNER ────────────────────────────────────────────
router.patch("/cp",                       protect, updateCpOwnerSeo);
router.post( "/cp/logo",                  protect, uploadBrandLogo.single("image"),  uploadCpOwnerLogo);
router.post( "/cp/seo-image",             protect, uploadSeoImage.single("image"),   uploadCpOwnerSeoImage);

export default router;
