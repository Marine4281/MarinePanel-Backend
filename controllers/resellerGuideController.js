//controllers/resellerGuideController.js

import ResellerGuide from "../models/ResellerGuide.js";

/*
--------------------------------
Get Guides (Public)
--------------------------------
Supports:
- /reseller-guides                          → admin guides (cpOwner: null)
- /reseller-guides?placement=activation
- /reseller-guides?placement=dashboard
- /reseller-guides?cpOwnerId=xxx            → CP owner's guides for their resellers
--------------------------------
*/
export const getResellerGuides = async (req, res) => {
  try {
    const { placement, cpOwnerId } = req.query;

    // Scope: if cpOwnerId provided show that CP's guides, else show admin guides
    let filter = {
      visible: true,
      cpOwner: cpOwnerId ? cpOwnerId : null,
    };

    if (placement === "activation") {
      filter.$or = [
        { placement: "activation" },
        { placement: "both" },
      ];
    }

    if (placement === "dashboard") {
      filter.$or = [
        { placement: "dashboard" },
        { placement: "both" },
      ];
    }

    const guides = await ResellerGuide.find(filter).sort({ order: 1 });
    res.json(guides);

  } catch (error) {
    console.error("Get guides error:", error);
    res.status(500).json({ message: "Failed to load guides" });
  }
};

/*
--------------------------------
Admin: Get All Guides (Including Hidden)
Admin only sees their own (cpOwner: null) guides
--------------------------------
*/
export const getAllGuidesAdmin = async (req, res) => {
  try {
    const guides = await ResellerGuide.find({ cpOwner: null }).sort({ order: 1 });
    res.json(guides);
  } catch (error) {
    console.error("Admin get guides error:", error);
    res.status(500).json({ message: "Failed to load guides" });
  }
};

/*
--------------------------------
Admin: Create Guide
--------------------------------
*/
export const createGuide = async (req, res) => {
  try {
    const { title, content, order, visible, placement } = req.body;

    if (!title || !content) {
      return res.status(400).json({ message: "Title and content are required" });
    }

    const validPlacements = ["activation", "dashboard", "both"];
    if (placement && !validPlacements.includes(placement)) {
      return res.status(400).json({ message: "Invalid placement value" });
    }

    const guide = await ResellerGuide.create({
      title,
      content,
      order: order || 0,
      visible: visible ?? true,
      placement: placement || "activation",
      cpOwner: null, // admin guides always null
    });

    res.json(guide);
  } catch (error) {
    console.error("Create guide error:", error);
    res.status(500).json({ message: "Failed to create guide" });
  }
};

/*
--------------------------------
Admin: Update Guide
--------------------------------
*/
export const updateGuide = async (req, res) => {
  try {
    const { title, content, order, visible, placement } = req.body;

    const validPlacements = ["activation", "dashboard", "both"];
    if (placement && !validPlacements.includes(placement)) {
      return res.status(400).json({ message: "Invalid placement value" });
    }

    const updatedData = {};
    if (title     !== undefined) updatedData.title     = title;
    if (content   !== undefined) updatedData.content   = content;
    if (order     !== undefined) updatedData.order     = order;
    if (visible   !== undefined) updatedData.visible   = visible;
    if (placement !== undefined) updatedData.placement = placement;

    const guide = await ResellerGuide.findOneAndUpdate(
      { _id: req.params.id, cpOwner: null }, // admin can only edit their own
      updatedData,
      { new: true, runValidators: true }
    );

    if (!guide) return res.status(404).json({ message: "Guide not found" });
    res.json(guide);
  } catch (error) {
    console.error("Update guide error:", error);
    res.status(500).json({ message: "Failed to update guide" });
  }
};

/*
--------------------------------
Admin: Delete Guide
--------------------------------
*/
export const deleteGuide = async (req, res) => {
  try {
    const guide = await ResellerGuide.findOneAndDelete({
      _id: req.params.id,
      cpOwner: null, // admin can only delete their own
    });

    if (!guide) return res.status(404).json({ message: "Guide not found" });
    res.json({ message: "Guide deleted" });
  } catch (error) {
    console.error("Delete guide error:", error);
    res.status(500).json({ message: "Failed to delete guide" });
  }
};
