import { Router } from "express";
import { protect } from "../middlewares/authMiddleware.js";
import { adminOnly } from "../middlewares/adminMiddleware.js";
import { cpOwnerOnly } from "../middlewares/childPanelMiddleware.js";
import {
  getCategories,
  adminGetCategories, adminCreateCategory, adminUpdateCategory, adminDeleteCategory,
  cpGetCategories, cpCreateCategory, cpUpdateCategory, cpDeleteCategory,
  createTicket, getUserTickets, getTicketById, userReply, getUserUnreadCount,
  adminGetTickets, adminGetTicket, adminReply, adminUpdateStatus, adminDeleteTicket, adminUnreadCount,
  cpGetTickets, cpGetTicket, cpReply, cpUpdateStatus, cpDeleteTicket, cpUnreadCount,
} from "../controllers/supportController.js";

const router = Router();

// ── Public user routes ─────────────────────────────────────────────
router.get("/categories",            protect, getCategories);
router.get("/unread-count",          protect, getUserUnreadCount);
router.get("/my-tickets",            protect, getUserTickets);
router.post("/tickets",              protect, createTicket);
router.get("/tickets/:id",           protect, getTicketById);
router.post("/tickets/:id/reply",    protect, userReply);

// ── Main admin routes ──────────────────────────────────────────────
router.get("/admin/categories",           protect, adminOnly, adminGetCategories);
router.post("/admin/categories",          protect, adminOnly, adminCreateCategory);
router.put("/admin/categories/:id",       protect, adminOnly, adminUpdateCategory);
router.delete("/admin/categories/:id",    protect, adminOnly, adminDeleteCategory);
router.get("/admin/unread-count",         protect, adminOnly, adminUnreadCount);
router.get("/admin/tickets",              protect, adminOnly, adminGetTickets);
router.get("/admin/tickets/:id",          protect, adminOnly, adminGetTicket);
router.post("/admin/tickets/:id/reply",   protect, adminOnly, adminReply);
router.put("/admin/tickets/:id/status",   protect, adminOnly, adminUpdateStatus);
router.delete("/admin/tickets/:id",       protect, adminOnly, adminDeleteTicket);

// ── CP owner routes ────────────────────────────────────────────────
router.get("/cp/categories",              protect, cpOwnerOnly, cpGetCategories);
router.post("/cp/categories",             protect, cpOwnerOnly, cpCreateCategory);
router.put("/cp/categories/:id",          protect, cpOwnerOnly, cpUpdateCategory);
router.delete("/cp/categories/:id",       protect, cpOwnerOnly, cpDeleteCategory);
router.get("/cp/unread-count",            protect, cpOwnerOnly, cpUnreadCount);
router.get("/cp/tickets",                 protect, cpOwnerOnly, cpGetTickets);
router.get("/cp/tickets/:id",             protect, cpOwnerOnly, cpGetTicket);
router.post("/cp/tickets/:id/reply",      protect, cpOwnerOnly, cpReply);
router.put("/cp/tickets/:id/status",      protect, cpOwnerOnly, cpUpdateStatus);
router.delete("/cp/tickets/:id",          protect, cpOwnerOnly, cpDeleteTicket);

export default router;
