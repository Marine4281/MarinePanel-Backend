// controllers/childPanelGuideController.js
import ChildPanelGuide from "../models/ChildPanelGuide.js";

const VALID_PLACEMENTS = ["activation", "dashboard", "both"];

/* -------------------------------------------------------
   PUBLIC — get visible guides (optionally filtered by placement)
   GET /api/child-panel/guides?placement=activation|dashboard
------------------------------------------------------- */
export const getChildPanelGuides = async (req, res) => {
  try {
    const { placement } = req.query;
    const filter = { visible: true };

    if (placement === "activation") {
      filter.$or = [{ placement: "activation" }, { placement: "both" }];
    } else if (placement === "dashboard") {
      filter.$or = [{ placement: "dashboard" }, { placement: "both" }];
    }

    const guides = await ChildPanelGuide.find(filter).sort({ order: 1 });
    res.json(guides);
  } catch (err) {
    console.error("CP guides fetch error:", err);
    res.status(500).json({ message: "Failed to load guides" });
  }
};

/* -------------------------------------------------------
   ADMIN — get ALL guides (including hidden)
   GET /api/admin/child-panel-guides
------------------------------------------------------- */
export const getAllChildPanelGuidesAdmin = async (req, res) => {
  try {
    const guides = await ChildPanelGuide.find({}).sort({ order: 1 });
    res.json(guides);
  } catch (err) {
    console.error("Admin CP guides fetch error:", err);
    res.status(500).json({ message: "Failed to load guides" });
  }
};

/* -------------------------------------------------------
   ADMIN — create guide
   POST /api/admin/child-panel-guides
------------------------------------------------------- */
export const createChildPanelGuide = async (req, res) => {
  try {
    const { title, content, order, visible, placement } = req.body;

    if (!title || !content) {
      return res.status(400).json({ message: "Title and content are required" });
    }

    if (placement && !VALID_PLACEMENTS.includes(placement)) {
      return res.status(400).json({ message: "Invalid placement value" });
    }

    const guide = await ChildPanelGuide.create({
      title,
      content,
      order: order ?? 0,
      visible: visible ?? true,
      placement: placement || "activation",
    });

    res.json(guide);
  } catch (err) {
    console.error("Create CP guide error:", err);
    res.status(500).json({ message: "Failed to create guide" });
  }
};

/* -------------------------------------------------------
   ADMIN — update guide
   PUT /api/admin/child-panel-guides/:id
------------------------------------------------------- */
export const updateChildPanelGuide = async (req, res) => {
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

    const guide = await ChildPanelGuide.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    );

    if (!guide) return res.status(404).json({ message: "Guide not found" });
    res.json(guide);
  } catch (err) {
    console.error("Update CP guide error:", err);
    res.status(500).json({ message: "Failed to update guide" });
  }
};

/* -------------------------------------------------------
   ADMIN — delete guide
   DELETE /api/admin/child-panel-guides/:id
------------------------------------------------------- */
export const deleteChildPanelGuide = async (req, res) => {
  try {
    const guide = await ChildPanelGuide.findByIdAndDelete(req.params.id);
    if (!guide) return res.status(404).json({ message: "Guide not found" });
    res.json({ message: "Guide deleted" });
  } catch (err) {
    console.error("Delete CP guide error:", err);
    res.status(500).json({ message: "Failed to delete guide" });
  }
};
