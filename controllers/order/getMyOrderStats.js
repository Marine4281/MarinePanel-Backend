import Order from "../../models/Order.js";

export const getMyOrdersStats = async (req, res) => {
  try {
    const { search, status, fromDate, toDate } = req.query;

    const match = {
      userId: req.user._id,
    };

    if (status) {
      match.status = status;
    }

    if (fromDate || toDate) {
      match.createdAt = {};

      if (fromDate) {
        match.createdAt.$gte = new Date(fromDate);
      }

      if (toDate) {
        match.createdAt.$lte = new Date(toDate);
      }
    }

    if (search) {
      const regex = new RegExp(search, "i");

      match.$or = [
        { customOrderId: regex },
        { service: regex },
        { link: regex },
      ];
    }

    const stats = await Order.aggregate([
      { $match: match },
      {
        $facet: {
          total: [{ $count: "count" }],
          pending: [
            { $match: { status: "pending" } },
            { $count: "count" },
          ],
          processing: [
            { $match: { status: "processing" } },
            { $count: "count" },
          ],
          completed: [
            { $match: { status: "completed" } },
            { $count: "count" },
          ],
          partial: [
            { $match: { status: "partial" } },
            { $count: "count" },
          ],
          failed: [
            { $match: { status: "failed" } },
            { $count: "count" },
          ],
        },
      },
    ]);

    const result = stats[0];

    res.json({
      total: result.total[0]?.count || 0,
      pending: result.pending[0]?.count || 0,
      processing: result.processing[0]?.count || 0,
      completed: result.completed[0]?.count || 0,
      partial: result.partial[0]?.count || 0,
      failed: result.failed[0]?.count || 0,
    });
  } catch (err) {
    console.error("USER STATS ERROR:", err);

    res.status(500).json({
      message: "Failed to fetch stats",
    });
  }
};
