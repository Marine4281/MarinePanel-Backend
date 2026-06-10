import { SupportTicket, TicketCategory } from "../models/PanelSupportTicket.js";
import User from "../models/User.js";

// ── Helper ────────────────────────────────────────────────────────
const err500 = (res, e) => res.status(500).json({ message: e?.message || "Server error" });

// ══════════════════════════════════════════════════════════════════
// CATEGORIES
// ══════════════════════════════════════════════════════════════════

// Public: get visible categories for a scope
export const getCategories = async (req, res) => {
  try {
    const { scope = "main", panelOwner } = req.query;
    const filter = { isVisible: true, scope };
    if (scope === "childPanel" && panelOwner) filter.panelOwner = panelOwner;
    const cats = await TicketCategory.find(filter).sort({ createdAt: 1 });
    res.json(cats);
  } catch (e) { err500(res, e); }
};

// Admin main: manage main-scope categories
export const adminGetCategories = async (req, res) => {
  try {
    const cats = await TicketCategory.find({ scope: "main" }).sort({ createdAt: 1 });
    res.json(cats);
  } catch (e) { err500(res, e); }
};

export const adminCreateCategory = async (req, res) => {
  try {
    const { label } = req.body;
    if (!label?.trim()) return res.status(400).json({ message: "Label required." });
    const cat = await TicketCategory.create({ label: label.trim(), scope: "main" });
    res.status(201).json(cat);
  } catch (e) { err500(res, e); }
};

export const adminUpdateCategory = async (req, res) => {
  try {
    const cat = await TicketCategory.findOneAndUpdate(
      { _id: req.params.id, scope: "main" }, req.body, { new: true }
    );
    if (!cat) return res.status(404).json({ message: "Not found" });
    res.json(cat);
  } catch (e) { err500(res, e); }
};

export const adminDeleteCategory = async (req, res) => {
  try {
    await TicketCategory.findOneAndDelete({ _id: req.params.id, scope: "main" });
    res.json({ message: "Deleted" });
  } catch (e) { err500(res, e); }
};

// CP Owner: manage childPanel-scope categories
export const cpGetCategories = async (req, res) => {
  try {
    const cats = await TicketCategory.find({ scope: "childPanel", panelOwner: req.user._id }).sort({ createdAt: 1 });
    res.json(cats);
  } catch (e) { err500(res, e); }
};

export const cpCreateCategory = async (req, res) => {
  try {
    const { label } = req.body;
    if (!label?.trim()) return res.status(400).json({ message: "Label required." });
    const cat = await TicketCategory.create({ label: label.trim(), scope: "childPanel", panelOwner: req.user._id });
    res.status(201).json(cat);
  } catch (e) { err500(res, e); }
};

export const cpUpdateCategory = async (req, res) => {
  try {
    const cat = await TicketCategory.findOneAndUpdate(
      { _id: req.params.id, scope: "childPanel", panelOwner: req.user._id },
      req.body, { new: true }
    );
    if (!cat) return res.status(404).json({ message: "Not found" });
    res.json(cat);
  } catch (e) { err500(res, e); }
};

export const cpDeleteCategory = async (req, res) => {
  try {
    await TicketCategory.findOneAndDelete({ _id: req.params.id, scope: "childPanel", panelOwner: req.user._id });
    res.json({ message: "Deleted" });
  } catch (e) { err500(res, e); }
};

// ══════════════════════════════════════════════════════════════════
// USER — create / view / reply tickets
// ══════════════════════════════════════════════════════════════════

export const createTicket = async (req, res) => {
  try {
    const { title, description, scope = "main", panelOwner, file } = req.body;
    if (!title?.trim() || !description?.trim())
      return res.status(400).json({ message: "Title and description required." });

    const ticket = await SupportTicket.create({
      user: req.user._id,
      scope,
      panelOwner: panelOwner || null,
      title: title.trim(),
      messages: [{
        sender: "user",
        senderName: req.user.username || req.user.email,
        text: description.trim(),
        seenByAdmin: false,
        seenByUser: true,
        ...(file ? { file } : {}),
      }],
    });
    res.status(201).json(ticket);
  } catch (e) { err500(res, e); }
};

export const getUserTickets = async (req, res) => {
  try {
    const { scope } = req.query;
    const filter = { user: req.user._id };
    if (scope) filter.scope = scope;
    const tickets = await SupportTicket.find(filter)
      .sort({ updatedAt: -1 })
      .select("title status createdAt updatedAt messages scope panelOwner");
    res.json(tickets);
  } catch (e) { err500(res, e); }
};

export const getTicketById = async (req, res) => {
  try {
    const ticket = await SupportTicket.findOne({ _id: req.params.id, user: req.user._id });
    if (!ticket) return res.status(404).json({ message: "Not found" });
    let changed = false;
    ticket.messages.forEach(m => {
      if (m.sender === "admin" && !m.seenByUser) { m.seenByUser = true; changed = true; }
    });
    if (changed) await ticket.save();
    res.json(ticket);
  } catch (e) { err500(res, e); }
};

export const userReply = async (req, res) => {
  try {
    const { text, file } = req.body;
    if (!text?.trim() && !file) return res.status(400).json({ message: "Empty message." });
    const ticket = await SupportTicket.findOne({ _id: req.params.id, user: req.user._id });
    if (!ticket) return res.status(404).json({ message: "Not found" });
    if (ticket.status === "closed") return res.status(400).json({ message: "Ticket is closed." });
    ticket.messages.push({
      sender: "user",
      senderName: req.user.username || req.user.email,
      text: text?.trim() || "",
      seenByAdmin: false,
      seenByUser: true,
      ...(file ? { file } : {}),
    });
    await ticket.save();
    res.json(ticket);
  } catch (e) { err500(res, e); }
};

export const getUserUnreadCount = async (req, res) => {
  try {
    const { scope } = req.query;
    const filter = { user: req.user._id };
    if (scope) filter.scope = scope;
    const tickets = await SupportTicket.find(filter);
    let count = 0;
    tickets.forEach(t => t.messages.forEach(m => { if (m.sender === "admin" && !m.seenByUser) count++; }));
    res.json({ count });
  } catch (e) { err500(res, e); }
};

// ══════════════════════════════════════════════════════════════════
// MAIN ADMIN — manages scope:"main" tickets
// ══════════════════════════════════════════════════════════════════

export const adminGetTickets = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = { scope: "main" };
    if (status) filter.status = status;
    const tickets = await SupportTicket.find(filter)
      .populate("user", "username email")
      .sort({ updatedAt: -1 });
    res.json(tickets);
  } catch (e) { err500(res, e); }
};

export const adminGetTicket = async (req, res) => {
  try {
    const ticket = await SupportTicket.findOne({ _id: req.params.id, scope: "main" })
      .populate("user", "username email");
    if (!ticket) return res.status(404).json({ message: "Not found" });
    let changed = false;
    ticket.messages.forEach(m => { if (m.sender === "user" && !m.seenByAdmin) { m.seenByAdmin = true; changed = true; } });
    if (changed) await ticket.save();
    res.json(ticket);
  } catch (e) { err500(res, e); }
};

export const adminReply = async (req, res) => {
  try {
    const { text, file } = req.body;
    if (!text?.trim() && !file) return res.status(400).json({ message: "Empty." });
    const ticket = await SupportTicket.findOne({ _id: req.params.id, scope: "main" });
    if (!ticket) return res.status(404).json({ message: "Not found" });
    ticket.messages.push({
      sender: "admin", senderName: "Support",
      text: text?.trim() || "",
      seenByAdmin: true, seenByUser: false,
      ...(file ? { file } : {}),
    });
    if (ticket.status === "open") ticket.status = "in_progress";
    await ticket.save();
    res.json(ticket);
  } catch (e) { err500(res, e); }
};

export const adminUpdateStatus = async (req, res) => {
  try {
    const ticket = await SupportTicket.findOneAndUpdate(
      { _id: req.params.id, scope: "main" },
      { status: req.body.status }, { new: true }
    ).populate("user", "username email");
    if (!ticket) return res.status(404).json({ message: "Not found" });
    res.json(ticket);
  } catch (e) { err500(res, e); }
};

export const adminDeleteTicket = async (req, res) => {
  try {
    await SupportTicket.findOneAndDelete({ _id: req.params.id, scope: "main" });
    res.json({ message: "Deleted" });
  } catch (e) { err500(res, e); }
};

export const adminUnreadCount = async (req, res) => {
  try {
    const tickets = await SupportTicket.find({ scope: "main" });
    let count = 0;
    tickets.forEach(t => t.messages.forEach(m => { if (m.sender === "user" && !m.seenByAdmin) count++; }));
    res.json({ count });
  } catch (e) { err500(res, e); }
};

// ══════════════════════════════════════════════════════════════════
// CP OWNER — manages scope:"childPanel" tickets for their panel
// ══════════════════════════════════════════════════════════════════

export const cpGetTickets = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = { scope: "childPanel", panelOwner: req.user._id };
    if (status) filter.status = status;
    const tickets = await SupportTicket.find(filter)
      .populate("user", "username email")
      .sort({ updatedAt: -1 });
    res.json(tickets);
  } catch (e) { err500(res, e); }
};

export const cpGetTicket = async (req, res) => {
  try {
    const ticket = await SupportTicket.findOne({ _id: req.params.id, scope: "childPanel", panelOwner: req.user._id })
      .populate("user", "username email");
    if (!ticket) return res.status(404).json({ message: "Not found" });
    let changed = false;
    ticket.messages.forEach(m => { if (m.sender === "user" && !m.seenByAdmin) { m.seenByAdmin = true; changed = true; } });
    if (changed) await ticket.save();
    res.json(ticket);
  } catch (e) { err500(res, e); }
};

export const cpReply = async (req, res) => {
  try {
    const { text, file } = req.body;
    if (!text?.trim() && !file) return res.status(400).json({ message: "Empty." });
    const ticket = await SupportTicket.findOne({ _id: req.params.id, scope: "childPanel", panelOwner: req.user._id });
    if (!ticket) return res.status(404).json({ message: "Not found" });
    ticket.messages.push({
      sender: "admin", senderName: req.user.childPanelBrandName || "Support",
      text: text?.trim() || "",
      seenByAdmin: true, seenByUser: false,
      ...(file ? { file } : {}),
    });
    if (ticket.status === "open") ticket.status = "in_progress";
    await ticket.save();
    res.json(ticket);
  } catch (e) { err500(res, e); }
};

export const cpUpdateStatus = async (req, res) => {
  try {
    const ticket = await SupportTicket.findOneAndUpdate(
      { _id: req.params.id, scope: "childPanel", panelOwner: req.user._id },
      { status: req.body.status }, { new: true }
    ).populate("user", "username email");
    if (!ticket) return res.status(404).json({ message: "Not found" });
    res.json(ticket);
  } catch (e) { err500(res, e); }
};

export const cpDeleteTicket = async (req, res) => {
  try {
    await SupportTicket.findOneAndDelete({ _id: req.params.id, scope: "childPanel", panelOwner: req.user._id });
    res.json({ message: "Deleted" });
  } catch (e) { err500(res, e); }
};

export const cpUnreadCount = async (req, res) => {
  try {
    const tickets = await SupportTicket.find({ scope: "childPanel", panelOwner: req.user._id });
    let count = 0;
    tickets.forEach(t => t.messages.forEach(m => { if (m.sender === "user" && !m.seenByAdmin) count++; }));
    res.json({ count });
  } catch (e) { err500(res, e); }
};
