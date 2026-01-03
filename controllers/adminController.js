import Order from "../models/Order.js";
import User from "../models/User.js";
import Settings from "../models/Settings.js";

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