// controllers/serviceTogglesController.js
import Service from "../models/Service.js";
import ServiceSettings from "../models/ServiceSettings.js";

/* =========================
   GET GLOBAL SETTINGS
========================= */
export const getServiceSettings = async (req, res) => {
  try {
    let settings = await ServiceSettings.findOne();

    if (!settings) {
      settings = await ServiceSettings.create({});
    }

    res.json(settings);
  } catch (err) {
    console.error("GET SETTINGS ERROR:", err);
    res.status(500).json({ message: "Failed to fetch settings" });
  }
};


/* =========================
   TOGGLE REFILL GLOBAL
========================= */
export const toggleRefillGlobal = async (req, res) => {
  try {
    let settings = await ServiceSettings.findOne();

    if (!settings) {
      settings = await ServiceSettings.create({});
    }

    const newState = !settings.globalRefillEnabled;

    // ✅ update global switch
    settings.globalRefillEnabled = newState;
    await settings.save();

    // ✅ OPTIONAL: also sync services (good for consistency)
    await Service.updateMany({}, { refillAllowed: newState });

    res.json({
      message: `Refill ${newState ? "enabled" : "disabled"}`,
      globalRefillEnabled: newState,
    });

  } catch (err) {
    console.error("REFILL TOGGLE ERROR:", err);
    res.status(500).json({ message: "Toggle refill failed" });
  }
};


/* =========================
   TOGGLE CANCEL GLOBAL
========================= */
export const toggleCancelGlobal = async (req, res) => {
  try {
    let settings = await ServiceSettings.findOne();

    if (!settings) {
      settings = await ServiceSettings.create({});
    }

    const newState = !settings.globalCancelEnabled;

    settings.globalCancelEnabled = newState;
    await settings.save();

    await Service.updateMany({}, { cancelAllowed: newState });

    res.json({
      message: `Cancel ${newState ? "enabled" : "disabled"}`,
      globalCancelEnabled: newState,
    });

  } catch (err) {
    console.error("CANCEL TOGGLE ERROR:", err);
    res.status(500).json({ message: "Toggle cancel failed" });
  }
};
