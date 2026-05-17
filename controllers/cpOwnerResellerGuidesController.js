// controllers/cpOwnerResellerGuidesController.js
//
// Child panel owners manage reseller guides for THEIR resellers.
// Guides are scoped by cpOwner field — CP owners can only
// see, create, edit, and delete their own guides.

import ResellerGuide from "../models/ResellerGuide.js";

const VALID_PLACEMENTS = ["activation", "dashboard", "both"];

/* -------------------------------------------------------
   GET /api/cp/reseller-guides
   CP owner fetches all their guides (including hidden)
------------------------------------------------------- */
export const getCPResellerGuides = async (req, res) => {
  try {
    const guides = await ResellerGuide.find({ cpOwner: req.user._id }).sort({ order: 1 });
    res.json(guides);
  } catch (err) {
    console.error("CP get reseller guides error:", err);
    res.status(500).json({ message: "Failed to load guides" });
  }
};

/* -------------------------------------------------------
   POST /api/cp/reseller-guides
   CP owner creates a guide
------------------------------------------------------- */
export const createCPResellerGuide = async (req, res) => {
  try {
    const { title, content, order, visible, placement } = req.body;

    if (!title || !content) {
      return res.status(400).json({ message: "Title and content are required" });
    }

    if (placement && !VALID_PLACEMENTS.includes(placement)) {
      return res.status(400).json({ message: "Invalid placement value" });
    }

    const guide = await ResellerGuide.create({
      title,
      content,
      order:     order ?? 0,
      visible:   visible ?? true,
      placement: placement || "activation",
      cpOwner:   req.user._id,
    });

    res.json(guide);
  } catch (err) {
    console.error("CP create reseller guide error:", err);
    res.status(500).json({ message: "Failed to create guide" });
  }
};

/* -------------------------------------------------------
   PUT /api/cp/reseller-guides/:id
   CP owner updates one of their guides
------------------------------------------------------- */
export const updateCPResellerGuide = async (req, res) => {
  try {
    const { title, content, order, visible, placement } = req.body;

    if (placement && !VALID_PLACEMENTS.includes(placement)) {
      return res.status(400).json({ message: "Invalid placement value" });
    }

    const updates = {};
    if (title     !== undefined) updates.title     = title;
    if (content   !== undefined) updates.content   = content;
    if (order     !== undefined) updates.order     = order;
    if (visible   !== undefined) updates.visible   = visible;
    if (placement !== undefined) updates.placement = placement;

    // cpOwner scoped — CP owner can only edit their own guides
    const guide = await ResellerGuide.findOneAndUpdate(
      { _id: req.params.id, cpOwner: req.user._id },
      updates,
      { new: true, runValidators: true }
    );

    if (!guide) return res.status(404).json({ message: "Guide not found" });
    res.json(guide);
  } catch (err) {
    console.error("CP update reseller guide error:", err);
    res.status(500).json({ message: "Failed to update guide" });
  }
};

/* -------------------------------------------------------
   DELETE /api/cp/reseller-guides/:id
   CP owner deletes one of their guides
------------------------------------------------------- */
export const deleteCPResellerGuide = async (req, res) => {
  try {
    const guide = await ResellerGuide.findOneAndDelete({
      _id: req.params.id,
      cpOwner: req.user._id,
    });

    if (!guide) return res.status(404).json({ message: "Guide not found" });
    res.json({ message: "Guide deleted" });
  } catch (err) {
    console.error("CP delete reseller guide error:", err);
    res.status(500).json({ message: "Failed to delete guide" });
  }
};
