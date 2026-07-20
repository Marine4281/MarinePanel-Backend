import CategoryMeta from "../models/CategoryMeta.js";
import CPCategoryMeta from "../models/CPCategoryMeta.js";
import Service from "../models/Service.js";

// GET /api/category-meta
// Public route — auto-scopes to the visiting child panel's own category
// meta (via req.childPanel, set by detectChildPanelDomain) the same way
// /api/services does. Falls back to platform-wide meta on the main domain.
export const getCategoryMeta = async (req, res) => {
  try {
    const cpOwner = req.childPanel?._id;

    const serviceMatch = cpOwner ? { status: true, cpOwner } : { status: true };

    const allCats = await Service.aggregate([
      { $match: serviceMatch },
      { $group: { _id: { platform: "$platform", category: "$category" } } },
      { $project: { _id: 0, platform: "$_id.platform", category: "$_id.category" } },
    ]);

    const savedMeta = cpOwner
      ? await CPCategoryMeta.find({ cpOwner }).lean()
      : await CategoryMeta.find().lean();

    const metaMap = {};
    savedMeta.forEach((m) => { metaMap[`${m.platform}::${m.category}`] = m; });

    const merged = allCats.map((c) => {
      const saved = metaMap[`${c.platform}::${c.category}`];
      return {
        platform:      c.platform,
        category:      c.category,
        sortOrder:     saved?.sortOrder     ?? 999,
        isFeatured:    saved?.isFeatured    ?? false,
        featuredColor: saved?.featuredColor ?? "orange",
        _id:           saved?._id           ?? null,
      };
    });

    res.json(merged);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch category meta" });
  }
};

export const saveCategoryMeta = async (req, res) => {
  try {
    const items = req.body;
    if (!Array.isArray(items) || items.length === 0)
      return res.status(400).json({ message: "Expected an array" });

    const ops = items.map(({ platform, category, sortOrder, isFeatured, featuredColor }) => ({
      updateOne: {
        filter: { platform, category },
        update: { $set: { sortOrder, isFeatured, featuredColor: featuredColor ?? "orange" } },
        upsert: true,
      },
    }));

    await CategoryMeta.bulkWrite(ops);
    res.json({ message: "Saved successfully" });
  } catch (err) {
    res.status(500).json({ message: "Failed to save category meta" });
  }
};

// GET /api/category-meta/:category/services
export const getCategoryServices = async (req, res) => {
  try {
    const category = decodeURIComponent(req.params.category);
    const cpOwner  = req.childPanel?._id;
    const match    = cpOwner ? { category, cpOwner } : { category };

    const services = await Service.find(match)
      .sort({ name: 1 })
      .lean();
    res.json(services);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch category services" });
  }
};
