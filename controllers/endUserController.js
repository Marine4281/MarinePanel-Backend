// controllers/endUserController.js
import User from "../models/User.js";
import Order from "../models/Order.js";
import Wallet from "../models/Wallet.js";

/*
--------------------------------
End User Dashboard
--------------------------------
*/
export const getEndUserDashboard = async (req, res) => {
  try {
    const userId = req.user._id;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Get wallet balance
    const wallet = await Wallet.findOne({ user: userId });

    // Get user orders
    const orders = await Order.find({ user: userId }).sort({ createdAt: -1 });

    // Determine reseller (either via req.reseller or user.resellerOwner)
    let reseller = req.reseller || null;
    if (!reseller && user.resellerOwner) {
      reseller = await User.findById(user.resellerOwner);
    }

    res.json({
      user: {
        name: user.name || user.email,
        email: user.email,
        balance: wallet?.balance || 0,
      },
      orders: orders || [],
      reseller: reseller
        ? {
            _id: reseller._id,
            brandName: reseller.brandName,
            logo: reseller.logo,
            themeColor: reseller.themeColor,
          }
        : null,
    });
  } catch (error) {
    console.error("End User Dashboard error:", error);
    res.status(500).json({ message: "Failed to load dashboard" });
  }
};

/*
--------------------------------
Get Reseller Branding for End User
--------------------------------
*/
export const getResellerBranding = async (req, res) => {
  try {
    // 1️⃣ Use req.reseller if visiting a subdomain
    let reseller = req.reseller || null;

    // 2️⃣ Fallback to user's resellerOwner if logged in
    if (!reseller && req.user?.resellerOwner) {
      reseller = await User.findById(req.user.resellerOwner);
    }

    // Return branding
    res.json({
      brandName: reseller?.brandName || "MarinePanel",
      logo: reseller?.logo || null,
      themeColor: reseller?.themeColor || "#ff6b00",
    });
  } catch (error) {
    console.error("Get Reseller Branding error:", error);
    res.status(500).json({ message: "Failed to fetch branding" });
  }
};

/*
--------------------------------
End User Orders
--------------------------------
*/
export const getEndUserOrders = async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json(orders || []);
  } catch (error) {
    console.error("Get End User Orders error:", error);
    res.status(500).json({ message: "Failed to fetch orders" });
  }
};
