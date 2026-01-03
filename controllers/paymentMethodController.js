import PaymentMethod from "../models/PaymentMethod.js";

// ====== User: Get Visible Methods ======
export const getUserPaymentMethods = async (req, res) => {
  try {
    const methods = await PaymentMethod.find({ isVisible: true });
    res.status(200).json({ methods });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch payment methods" });
  }
};

// ====== Admin: Get All Methods ======
export const getAllPaymentMethods = async (req, res) => {
  try {
    const methods = await PaymentMethod.find();
    res.status(200).json({ methods });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch payment methods" });
  }
};

// ====== Admin: Add New Method ======
export const addPaymentMethod = async (req, res) => {
  try {
    const newMethod = new PaymentMethod(req.body);
    await newMethod.save();
    res.status(201).json({ message: "Payment method added", method: newMethod });
  } catch (error) {
    res.status(500).json({ message: "Failed to add payment method" });
  }
};

// ====== Admin: Update Method ======
export const updatePaymentMethod = async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await PaymentMethod.findByIdAndUpdate(id, req.body, { new: true });
    res.status(200).json({ message: "Payment method updated", method: updated });
  } catch (error) {
    res.status(500).json({ message: "Failed to update payment method" });
  }
};

// ====== Admin: Toggle Visibility ======
export const togglePaymentMethod = async (req, res) => {
  try {
    const { id } = req.params;
    const method = await PaymentMethod.findById(id);
    if (!method) return res.status(404).json({ message: "Method not found" });

    method.isVisible = !method.isVisible;
    await method.save();
    res.status(200).json({ message: "Visibility toggled", method });
  } catch (error) {
    res.status(500).json({ message: "Failed to toggle visibility" });
  }
};