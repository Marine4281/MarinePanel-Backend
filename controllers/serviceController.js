import Order from "../models/Order.js";
import User from "../models/User.js";
import Service from "../models/Service.js";

// ------------------------
// Place a new order
// ------------------------
export const placeOrder = async (req, res) => {
  try {
    const { userId, category, service, link, quantity, charge } = req.body;

    if (!userId || !category || !service || !link || !quantity || !charge) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.balance < charge) {
      return res.status(400).json({ message: "Insufficient balance" });
    }

    // Deduct balance
    user.balance -= charge;
    await user.save();

    // Create order
    const order = await Order.create({ userId, category, service, link, quantity, charge });
    res.status(201).json(order);

  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// ------------------------
// Get all services for users (public)
// ------------------------
export const getServicesPublic = async (req, res) => {
  try {
    const { category } = req.query;
    let services;

    if (category) {
      services = await Service.find({ category, status: true });
    } else {
      services = await Service.find({ status: true });
    }

    res.status(200).json(services);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};