// controllers/resellerGuideController.js

import ResellerGuide from "../models/ResellerGuide.js";
import User from "../models/User.js";

/*
--------------------------------
Get Guides (Public + Auth-aware)
--------------------------------
Resolution order for cpOwner scope:
  1. Explicit ?cpOwnerId=xxx query param (legacy / admin use)
  2. Logged-in reseller's user.childPanelOwner (auto — CP reseller)
  3. req.childPanel from domain middleware (CP domain request)
  4. null → main platform admin guides
--------------------------------
*/
export const getResellerGuides = async (req, res) => {
  try {
    const { placement, cpOwnerId } = req.query;

    let resolvedCpOwnerId = cpOwnerId || null;

    // Auto-resolve from authenticated user
    if (!resolvedCpOwnerId && req.user) {
      const user = await User.findById(req.user._id).select("childPanelOwner resellerOwner").lean();

      if (user?.childPanelOwner) {
        // Direct CP reseller
        resolvedCpOwnerId = user.childPanelOwner.toString();
      } else if (user?.resellerOwner) {
        // End-user under a CP reseller — resolve the reseller's CP owner
        const resellerUser = await User.findById(user.resellerOwner)
          .select("childPanelOwner")
          .lean();
        if (resellerUser?.childPanelOwner) {
          resolvedCpOwnerId = resellerUser.childPanelOwner.toString();
        }
      }
    }

    // Also try domain middleware (unauthenticated CP domain request)
    if (!resolvedCpOwnerId && req.childPanel) {
      resolvedCpOwnerId = req.childPanel._id.toString();
    }

    const filter = {
      visible: true,
      cpOwner: resolvedCpOwnerId || null,
    };

    if (placement === "activation") {
      filter.$or = [{ placement: "activation" }, { placement: "both" }];
    }

    if (placement === "dashboard") {
      filter.$or = [{ placement: "dashboard" }, { placement: "both" }];
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
      cpOwner: null,
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
      { _id: req.params.id, cpOwner: null },
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
      cpOwner: null,
    });

    if (!guide) return res.status(404).json({ message: "Guide not found" });
    res.json({ message: "Guide deleted" });
  } catch (error) {
    console.error("Delete guide error:", error);
    res.status(500).json({ message: "Failed to delete guide" });
  }
};
