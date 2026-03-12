import ResellerGuide from "../models/ResellerGuide.js";

/*
--------------------------------
Get Guides (Public)
--------------------------------
*/
export const getResellerGuides = async (req, res) => {
  try {
    const guides = await ResellerGuide.find({ visible: true })
      .sort({ order: 1 });

    res.json(guides);
  } catch (error) {
    console.error("Get guides error:", error);
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
    const { title, content, order } = req.body;

    if (!title || !content) {
      return res.status(400).json({
        message: "Title and content are required",
      });
    }

    const guide = await ResellerGuide.create({
      title,
      content,
      order: order || 0,
      visible: true,
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
    const guide = await ResellerGuide.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    if (!guide) {
      return res.status(404).json({ message: "Guide not found" });
    }

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
    const guide = await ResellerGuide.findByIdAndDelete(req.params.id);

    if (!guide) {
      return res.status(404).json({ message: "Guide not found" });
    }

    res.json({ message: "Guide deleted" });
  } catch (error) {
    console.error("Delete guide error:", error);
    res.status(500).json({ message: "Failed to delete guide" });
  }
};
