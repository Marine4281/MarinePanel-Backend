// controllers/order/getMyOrdersStats.js

import Order from "../../models/Order.js";

export const getMyOrdersStats = async (req, res) => {
  try {
    const { search, status, fromDate, toDate } = req.query;

    // Same dual-field match as getMyOrders
    const userMatch = [
      { userId: req.user._id },
      { endUserId: req.user._id },
    ];

    const match = {
      $or: userMatch,
    };

    if (status) {
      match.status = status;
    }

    if (fromDate || toDate) {
      match.createdAt = {};
      if (fromDate) match.createdAt.$gte = new Date(fromDate);
      if (toDate) {
        const end = new Date(toDate);
        end.setHours(23, 59, 59, 999);
        match.createdAt.$lte = end;
      }
    }

    if (search) {
      const cleanSearch = search.replace("#", "").trim();
      const orConditions = [
        { service: { $regex: cleanSearch, $options: "i" } },
        { link: { $regex: cleanSearch, $options: "i" } },
      ];
      if (!isNaN(cleanSearch)) {
        orConditions.push({ customOrderId: Number(cleanSearch) });
      }

      // Merge: both userMatch AND search conditions must hold
      match.$and = [
        { $or: userMatch },
        { $or: orConditions },
      ];
      delete match.$or;
    }

    // Orders whose provider explicitly reports "in progress" / "inprogress",
    // as opposed to "processing" status orders with no such provider text yet.
    const inProgressRegex = /in\s*progress/i;

    const stats = await Order.aggregate([
      { $match: match },
      {
        $facet: {
          total: [{ $count: "count" }],
          pending: [{ $match: { status: "pending" } }, { $count: "count" }],
          processing: [
            {
              $match: {
                status: "processing",
                providerStatus: { $not: inProgressRegex },
              },
            },
            { $count: "count" },
          ],
          inProgress: [
            {
              $match: {
                status: "processing",
                providerStatus: inProgressRegex,
              },
            },
            { $count: "count" },
          ],
          completed: [{ $match: { status: "completed" } }, { $count: "count" }],
          partial: [{ $match: { status: "partial" } }, { $count: "count" }],
          failed: [{ $match: { status: "failed" } }, { $count: "count" }],
        },
      },
    ]);

    const result = stats[0];

    res.json({
      total: result.total[0]?.count || 0,
      pending: result.pending[0]?.count || 0,
      processing: result.processing[0]?.count || 0,
      inProgress: result.inProgress[0]?.count || 0,
      completed: result.completed[0]?.count || 0,
      partial: result.partial[0]?.count || 0,
      failed: result.failed[0]?.count || 0,
    });
  } catch (err) {
    console.error("USER STATS ERROR:", err);
    res.status(500).json({ message: "Failed to fetch stats" });
  }
};
