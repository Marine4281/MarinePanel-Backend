import Service from "../models/Service.js";

/* =========================
   TOGGLE REFILL
========================= */
export const toggleRefill = async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);

    if (!service) {
      return res.status(404).json({ message: "Service not found" });
    }

    service.refillAllowed = !service.refillAllowed;

    // safety reset
    if (!service.refillAllowed) {
      service.refillPolicy = "none";
      service.customRefillDays = null;
    }

    await service.save();

    res.json({
      message: `Refill ${service.refillAllowed ? "enabled" : "disabled"}`,
      refillAllowed: service.refillAllowed,
    });

  } catch (err) {
    res.status(500).json({ message: "Toggle refill failed" });
  }
};

/* =========================
   TOGGLE CANCEL
========================= */
export const toggleCancel = async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);

    if (!service) {
      return res.status(404).json({ message: "Service not found" });
    }

    service.cancelAllowed = !service.cancelAllowed;

    await service.save();

    res.json({
      message: `Cancel ${service.cancelAllowed ? "enabled" : "disabled"}`,
      cancelAllowed: service.cancelAllowed,
    });

  } catch (err) {
    res.status(500).json({ message: "Toggle cancel failed" });
  }
};
