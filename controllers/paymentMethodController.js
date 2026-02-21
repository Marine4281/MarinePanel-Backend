import PaymentMethod from "../models/PaymentMethod.js";

// ====== User: Get Visible Methods ======
export const getUserPaymentMethods = async (req, res) => {
  try {
    const methods = await PaymentMethod.find({ isVisible: true }).sort({ createdAt: -1 });
    res.status(200).json({ methods });
  } catch (error) {
    console.error("getUserPaymentMethods error:", error);
    res.status(500).json({ message: "Failed to fetch payment methods" });
  }
};

// ====== Admin: Get All Methods ======
export const getAllPaymentMethods = async (req, res) => {
  try {
    const methods = await PaymentMethod.find().sort({ createdAt: -1 });
    res.status(200).json({ methods });
  } catch (error) {
    console.error("getAllPaymentMethods error:", error);
    res.status(500).json({ message: "Failed to fetch payment methods" });
  }
};

// ====== Admin: Add New Method ======
export const addPaymentMethod = async (req, res) => {
  try {
    const { name, type, minDeposit = 0, description, isVisible = true } = req.body;

    if (!name || !type) {
      return res.status(400).json({ message: "Name and type are required" });
    }

    if (Number(minDeposit) < 0) {
      return res.status(400).json({ message: "Min deposit must be at least 0" });
    }

    const newMethod = new PaymentMethod({
      name,
      type: type.toLowerCase(),
      minDeposit,
      description,
      isVisible,
    });

    await newMethod.save();
    res.status(201).json({ message: "Payment method added", method: newMethod });
  } catch (error) {
    console.error("addPaymentMethod error:", error);
    res.status(500).json({ message: "Failed to add payment method" });
  }
};

// ====== Admin: Update Method ======
export const updatePaymentMethod = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, type, minDeposit, description, isVisible } = req.body;

    if (!name || !type) {
      return res.status(400).json({ message: "Name and type are required" });
    }

    const updated = await PaymentMethod.findByIdAndUpdate(
      id,
      {
        name,
        type: type.toLowerCase(),
        minDeposit: Number(minDeposit),
        description,
        isVisible,
      },
      { new: true }
    );

    if (!updated) return res.status(404).json({ message: "Method not found" });

    res.status(200).json({ message: "Payment method updated", method: updated });
  } catch (error) {
    console.error("updatePaymentMethod error:", error);
    res.status(500).json({ message: "Failed to update payment method" });
  }
};

// ====== Admin: Toggle Visibility ======
export const togglePaymentMethod = async (req, res) => {
  try {
    const { id } = req.params;
    const method = await PaymentMethod.findById(id);

    if (!method) return res.status(404).json({ message: "Payment method not found" });

    method.isVisible = !method.isVisible;
    await method.save();

    res.status(200).json({ message: "Visibility toggled", method });
  } catch (error) {
    console.error("togglePaymentMethod error:", error);
    res.status(500).json({ message: "Failed to toggle visibility" });
  }
};
