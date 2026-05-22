import Order from "../../models/Order.js";

export const getMyOrders = async (req, res) => {
  try {
    const {
      search = "",
      status,
      fromDate,
      toDate,
      page = 1,
      limit = 10,
    } = req.query;

    const query = {
      userId: req.user._id,
    };

    if (search && search.trim() !== "") {
      const cleanSearch = search.replace("#", "").trim();

      const orConditions = [
        {
          service: {
            $regex: cleanSearch,
            $options: "i",
          },
        },
        {
          link: {
            $regex: cleanSearch,
            $options: "i",
          },
        },
      ];

      if (!isNaN(cleanSearch)) {
        orConditions.push({
          customOrderId: Number(cleanSearch),
        });
      }

      query.$or = orConditions;
    }

    if (status) {
      query.status = status;
    }

    if (fromDate || toDate) {
      query.createdAt = {};

      if (fromDate) {
        query.createdAt.$gte = new Date(fromDate);
      }

      if (toDate) {
        const end = new Date(toDate);
        end.setHours(23, 59, 59, 999);

        query.createdAt.$lte = end;
      }
    }

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.max(1, Number(limit));
    const skip = (pageNum - 1) * limitNum;

    const [orders, total] = await Promise.all([
      Order.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),

      Order.countDocuments(query),
    ]);

    res.json({
      orders,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (error) {
    console.error("GET MY ORDERS ERROR:", error);

    res.status(500).json({
      message: "Failed to fetch orders",
    });
  }
};
