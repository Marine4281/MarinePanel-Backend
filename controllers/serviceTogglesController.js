// controllers/serviceTogglesController.js
import Service from "../models/Service.js";

/* =========================
   🔥 GLOBAL TOGGLE REFILL
========================= */
export const toggleRefillGlobal = async (req, res) => {
  try {
    // 1. Get current state (take any service)
    const sample = await Service.findOne();

    if (!sample) {
      return res.status(404).json({ message: "No services found" });
    }

    const newState = !sample.refillAllowed;

    // 2. Update ALL services
    await Service.updateMany(
      {},
      {
        $set: {
          refillAllowed: newState,
          ...(newState === false && {
            refillPolicy: "none",
            customRefillDays: null,
          }),
        },
      }
    );

    res.json({
      message: `Refill globally ${newState ? "enabled" : "disabled"}`,
      refillAllowed: newState,
    });

  } catch (err) {
    console.error("GLOBAL REFILL ERROR:", err);
    res.status(500).json({ message: "Global toggle refill failed" });
  }
};


/* =========================
   🔥 GLOBAL TOGGLE CANCEL
========================= */
export const toggleCancelGlobal = async (req, res) => {
  try {
    // 1. Get current state
    const sample = await Service.findOne();

    if (!sample) {
      return res.status(404).json({ message: "No services found" });
    }

    const newState = !sample.cancelAllowed;

    // 2. Update ALL services
    await Service.updateMany(
      {},
      {
        $set: {
          cancelAllowed: newState,
        },
      }
    );

    res.json({
      message: `Cancel globally ${newState ? "enabled" : "disabled"}`,
      cancelAllowed: newState,
    });

  } catch (err) {
    console.error("GLOBAL CANCEL ERROR:", err);
    res.status(500).json({ message: "Global toggle cancel failed" });
  }
};

/* =========================
   🔥 GET GLOBAL SETTINGS
========================= */
export const getServiceSettings = async (req, res) => {
  try {
    const sample = await Service.findOne();

    if (!sample) {
      return res.json({
        globalRefillEnabled: false,
        globalCancelEnabled: false,
      });
    }

    res.json({
      globalRefillEnabled: sample.refillAllowed ?? false,
      globalCancelEnabled: sample.cancelAllowed ?? false,
    });

  } catch (err) {
    console.error("GET SETTINGS ERROR:", err);
    res.status(500).json({ message: "Failed to fetch settings" });
  }
};
