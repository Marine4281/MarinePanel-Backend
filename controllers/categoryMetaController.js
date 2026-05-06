import CategoryMeta from "../models/CategoryMeta.js";
import Service from "../models/Service.js";

export const getCategoryMeta = async (req, res) => {
  try {
    const allCats = await Service.aggregate([
      { $match: { status: true } },
      { $group: { _id: { platform: "$platform", category: "$category" } } },
      { $project: { _id: 0, platform: "$_id.platform", category: "$_id.category" } },
    ]);

    const savedMeta = await CategoryMeta.find().lean();
    const metaMap = {};
    savedMeta.forEach((m) => { metaMap[`${m.platform}::${m.category}`] = m; });

    const merged = allCats.map((c) => {
      const saved = metaMap[`${c.platform}::${c.category}`];
      return {
        platform: c.platform,
        category: c.category,
        sortOrder: saved?.sortOrder ?? 999,
        isFeatured: saved?.isFeatured ?? false,
        _id: saved?._id ?? null,
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

    const ops = items.map(({ platform, category, sortOrder, isFeatured }) => ({
      updateOne: {
        filter: { platform, category },
        update: { $set: { sortOrder, isFeatured } },
        upsert: true,
      },
    }));

    await CategoryMeta.bulkWrite(ops);
    res.json({ message: "Saved successfully" });
  } catch (err) {
    res.status(500).json({ message: "Failed to save category meta" });
  }
};
