import Order from "../models/Order.js";
import User from "../models/User.js";
import Settings from "../models/Settings.js";

/**
 * Shared date-range filter builder (mirrors the logic already used in
 * getStats / getOrders below) — kept local to this file, only used by
 * the new revenue-trend / top-performers endpoints.
 */
const buildDateFilter = (dateRange = "all", now = new Date()) => {
  let dateFilter = {};

  if (dateRange === "today") {
    dateFilter.createdAt = {
      $gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
      $lt: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1),
    };
  } else if (dateRange === "yesterday") {
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    dateFilter.createdAt = {
      $gte: new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate()),
      $lt: new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate() + 1),
    };
  } else if (dateRange === "7days") {
    dateFilter.createdAt = { $gte: new Date(now - 7 * 24 * 60 * 60 * 1000) };
  } else if (dateRange === "30days") {
    dateFilter.createdAt = { $gte: new Date(now - 30 * 24 * 60 * 60 * 1000) };
  } else if (dateRange === "year") {
    dateFilter.createdAt = {
      $gte: new Date(now.getFullYear(), 0, 1),
      $lt: new Date(now.getFullYear() + 1, 0, 1),
    };
  }

  return dateFilter;
};

/**
 * GET /api/admin/stats
 */
export const getStats = async (req, res) => {
  try {
    const { revenue = "total", country = "All", dateRange = "all" } = req.query;
    const now = new Date();
    let dateFilter = {};

    // Apply dateRange filter
    if (dateRange === "today") {
      dateFilter.createdAt = {
        $gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
        $lt: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1),
      };
    } else if (dateRange === "yesterday") {
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      dateFilter.createdAt = {
        $gte: new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate()),
        $lt: new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate() + 1),
      };
    } else if (dateRange === "7days") {
      dateFilter.createdAt = { $gte: new Date(now - 7 * 24 * 60 * 60 * 1000) };
    } else if (dateRange === "30days") {
      dateFilter.createdAt = { $gte: new Date(now - 30 * 24 * 60 * 60 * 1000) };
    } else if (dateRange === "year") {
      dateFilter.createdAt = {
        $gte: new Date(now.getFullYear(), 0, 1),
        $lt: new Date(now.getFullYear() + 1, 0, 1),
      };
    }

    // Fetch settings (commission)
    const settings = await Settings.findOne();
    const commission = settings?.commission ?? 50;

    // Fetch orders
    let orders = await Order.find(dateFilter)
      .sort({ createdAt: -1 })
      .populate({
        path: "userId",
        select: "name email country",
        match: country !== "All" ? { country } : {},
      });

    if (country !== "All") {
      orders = orders.filter((order) => order.userId !== null);
    }

    const totalUsers = await User.countDocuments();
    const totalOrders = orders.length;

    // 🔥 COMMISSION-BASED REVENUE
    const grossRevenue = orders.reduce((acc, o) => acc + (o.charge || 0), 0);
    const totalRevenue = (grossRevenue * commission) / 100;

    const revenueByCountry = await Order.aggregate([
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: "$user" },
      ...(country !== "All" ? [{ $match: { "user.country": country } }] : []),
      ...(dateRange !== "all" ? [{ $match: dateFilter }] : []),
      {
        $group: {
          _id: "$user.country",
          orders: { $sum: 1 },
          gross: { $sum: "$charge" },
        },
      },
      {
        $project: {
          country: "$_id",
          orders: 1,
          revenue: {
            $multiply: ["$gross", commission / 100],
          },
          _id: 0,
        },
      },
    ]);

    res.json({
      totalUsers,
      totalOrders,
      commission,
      totalRevenue,
      revenueByCountry,
      orders,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch stats" });
  }
};

/**
 * GET /api/admin/orders
 */
export const getOrders = async (req, res) => {
  try {
    const { country = "All", status, dateRange = "all" } = req.query;
    const now = new Date();
    let dateFilter = {};

    if (dateRange === "today") {
      dateFilter.createdAt = {
        $gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
        $lt: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1),
      };
    } else if (dateRange === "yesterday") {
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      dateFilter.createdAt = {
        $gte: new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate()),
        $lt: new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate() + 1),
      };
    } else if (dateRange === "7days") {
      dateFilter.createdAt = { $gte: new Date(now - 7 * 24 * 60 * 60 * 1000) };
    } else if (dateRange === "30days") {
      dateFilter.createdAt = { $gte: new Date(now - 30 * 24 * 60 * 60 * 1000) };
    } else if (dateRange === "year") {
      dateFilter.createdAt = {
        $gte: new Date(now.getFullYear(), 0, 1),
        $lt: new Date(now.getFullYear() + 1, 0, 1),
      };
    }

    let filter = { ...dateFilter };
    if (status) filter.status = status;

    let orders = await Order.find(filter)
      .sort({ createdAt: -1 })
      .populate({
        path: "userId",
        select: "name email country",
        match: country !== "All" ? { country } : {},
      });

    if (country !== "All") {
      orders = orders.filter((order) => order.userId !== null);
    }

    res.json(orders);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch orders" });
  }
};

/**
 * GET /api/admin/users
 */
export const getUsers = async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch users" });
  }
};

// =================== RESET REVENUE ===================
export const resetRevenue = async (req, res) => {
  try {
    await Settings.updateOne({}, { totalRevenue: 0 }, { upsert: true });
    res.json({ message: "Revenue has been reset" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to reset revenue" });
  }
};

// =================== UPDATE COMMISSION ===================
export const updateCommission = async (req, res) => {
  try {
    const { commissionPercentage } = req.body;

    if (
      commissionPercentage == null ||
      commissionPercentage < 0 ||
      commissionPercentage > 100
    ) {
      return res.status(400).json({ message: "Invalid commission percentage" });
    }

    const settings = await Settings.findOneAndUpdate(
      {},
      { commission: commissionPercentage },
      { new: true, upsert: true }
    );

    res.json({
      message: "Commission updated successfully",
      commission: settings.commission,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to update commission" });
  }
};

/**
 * GET /api/admin/revenue-trend
 * Returns { range, labels, data } for the dashboard chart.
 * range: "today" | "week" | "month" | "year" (default "week")
 */
export const getRevenueTrend = async (req, res) => {
  try {
    const { range = "week", country = "All" } = req.query;
    const now = new Date();

    const settings = await Settings.findOne();
    const commission = settings?.commission ?? 50;

    let start, end, bucketCount, getBucketIndex, getLabel;

    if (range === "today") {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
      bucketCount = 24;
      getBucketIndex = (d) => d.getHours();
      getLabel = (i) => {
        const period = i < 12 ? "AM" : "PM";
        const hour12 = i % 12 === 0 ? 12 : i % 12;
        return `${hour12} ${period}`;
      };
    } else if (range === "month") {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      bucketCount = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      getBucketIndex = (d) => d.getDate() - 1;
      getLabel = (i) =>
        new Date(now.getFullYear(), now.getMonth(), i + 1).toLocaleDateString("en-US", {
          day: "numeric",
          month: "short",
        });
    } else if (range === "year") {
      start = new Date(now.getFullYear(), 0, 1);
      end = new Date(now.getFullYear() + 1, 0, 1);
      bucketCount = 12;
      getBucketIndex = (d) => d.getMonth();
      getLabel = (i) => new Date(2000, i, 1).toLocaleDateString("en-US", { month: "short" });
    } else {
      // "week" — rolling last 7 days ending today
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      bucketCount = 7;
      getBucketIndex = (d) => {
        const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        return Math.round((dayStart - start) / (24 * 60 * 60 * 1000));
      };
      getLabel = (i) =>
        new Date(start.getTime() + i * 24 * 60 * 60 * 1000).toLocaleDateString("en-US", {
          weekday: "short",
        });
    }

    let orders = await Order.find({ createdAt: { $gte: start, $lt: end } })
      .select("charge createdAt userId")
      .populate({
        path: "userId",
        select: "country",
        match: country !== "All" ? { country } : {},
      });

    if (country !== "All") {
      orders = orders.filter((o) => o.userId !== null);
    }

    const buckets = new Array(bucketCount).fill(0);

    orders.forEach((o) => {
      const idx = getBucketIndex(new Date(o.createdAt));
      if (idx >= 0 && idx < bucketCount) {
        buckets[idx] += ((o.charge || 0) * commission) / 100;
      }
    });

    const labels = Array.from({ length: bucketCount }, (_, i) => getLabel(i));
    const data = buckets.map((v) => Number(v.toFixed(2)));

    res.json({ range, labels, data });
  } catch (err) {
    console.error("Revenue trend error:", err);
    res.status(500).json({ message: "Failed to fetch revenue trend" });
  }
};

/**
 * GET /api/admin/top-performers
 * Returns { platforms, categories, services } — each an array of
 * { name, orders, revenue }, sorted by revenue desc, top `limit` (default 5).
 */
export const getTopPerformers = async (req, res) => {
  try {
    const { dateRange = "30days", country = "All", limit = 5 } = req.query;

    const settings = await Settings.findOne();
    const commission = settings?.commission ?? 50;

    const dateFilter = buildDateFilter(dateRange);

    let orders = await Order.find(dateFilter)
      .select("charge platform category service userId")
      .populate({
        path: "userId",
        select: "country",
        match: country !== "All" ? { country } : {},
      });

    if (country !== "All") {
      orders = orders.filter((o) => o.userId !== null);
    }

    const rank = (keyFn) => {
      const groups = {};
      orders.forEach((o) => {
        const key = keyFn(o) || "Unknown";
        if (!groups[key]) groups[key] = { name: key, orders: 0, revenue: 0 };
        groups[key].orders += 1;
        groups[key].revenue += ((o.charge || 0) * commission) / 100;
      });
      return Object.values(groups)
        .map((g) => ({ ...g, revenue: Number(g.revenue.toFixed(2)) }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, Number(limit));
    };

    res.json({
      platforms: rank((o) => o.platform),
      categories: rank((o) => o.category),
      services: rank((o) => o.service),
    });
  } catch (err) {
    console.error("Top performers error:", err);
    res.status(500).json({ message: "Failed to fetch top performers" });
  }
};
