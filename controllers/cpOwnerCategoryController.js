// controllers/cpOwnerCategoryController.js
// CP Owner — manage their own category sort order, featured status & featured colour
// Uses a per-cpOwner scoped CategoryMeta model

import CPCategoryMeta from "../models/CPCategoryMeta.js";
import Service from "../models/Service.js";

// GET /api/cp/categories
export const getCPCategoryMeta = async (req, res) => {
  try {
    const cpOwner = req.cpOwnerId;

    // Build list from this CP's actual services
    const allCats = await Service.aggregate([
      { $match: { cpOwner, status: true } },
      {
        $group: {
          _id: { platform: "$platform", category: "$category" },
        },
      },
      {
        $project: {
          _id: 0,
          platform: "$_id.platform",
          category: "$_id.category",
        },
      },
    ]);

    const savedMeta = await CPCategoryMeta.find({ cpOwner }).lean();
    const metaMap = {};
    savedMeta.forEach((m) => {
      metaMap[`${m.platform}::${m.category}`] = m;
    });

    const merged = allCats.map((c) => {
      const saved = metaMap[`${c.platform}::${c.category}`];
      return {
        platform:    c.platform,
        category:    c.category,
        sortOrder:   saved?.sortOrder   ?? 999,
        isFeatured:  saved?.isFeatured  ?? false,
        featuredColor: saved?.featuredColor ?? "orange", // "orange" | "blue"
        _id:         saved?._id ?? null,
      };
    });

    res.json(merged);
  } catch (err) {
    console.error("CP GET CATEGORIES ERROR:", err);
    res.status(500).json({ message: "Failed to fetch categories" });
  }
};

// POST /api/cp/categories
export const saveCPCategoryMeta = async (req, res) => {
  try {
    const cpOwner = req.cpOwnerId;
    const items   = req.body;

    if (!Array.isArray(items) || items.length === 0)
      return res.status(400).json({ message: "Expected an array" });

    const ops = items.map(({ platform, category, sortOrder, isFeatured, featuredColor }) => ({
      updateOne: {
        filter:  { cpOwner, platform, category },
        update:  { $set: { sortOrder, isFeatured, featuredColor: featuredColor ?? "orange" } },
        upsert:  true,
      },
    }));

    await CPCategoryMeta.bulkWrite(ops);
    res.json({ message: "Saved successfully" });
  } catch (err) {
    console.error("CP SAVE CATEGORIES ERROR:", err);
    res.status(500).json({ message: "Failed to save categories" });
  }
};

// GET /api/cp/categories/:category/services
// Returns all services for a given category (tapping a category lists its services)
export const getCPCategoryServices = async (req, res) => {
  try {
    const cpOwner  = req.cpOwnerId;
    const category = decodeURIComponent(req.params.category);

    const services = await Service.find({ cpOwner, category })
      .sort({ name: 1 })
      .lean();

    res.json(services);
  } catch (err) {
    console.error("CP CATEGORY SERVICES ERROR:", err);
    res.status(500).json({ message: "Failed to fetch category services" });
  }
};
