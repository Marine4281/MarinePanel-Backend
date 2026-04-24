import ServiceSettings from "../models/ServiceSettings.js";

/* =========================================================
   🔥 GET GLOBAL SETTINGS
========================================================= */
export const getServiceSettings = async (req, res) => {
  try {
    let settings = await ServiceSettings.findOne();

    if (!settings) {
      settings = await ServiceSettings.create({});
    }

    res.json(settings);
  } catch (err) {
    console.error("GET SETTINGS ERROR:", err);
    res.status(500).json({
      message: "Failed to fetch service settings",
    });
  }
};

/* =========================================================
   🔥 TOGGLE REFILL GLOBALLY
========================================================= */
export const toggleRefillGlobal = async (req, res) => {
  try {
    let settings = await ServiceSettings.findOne();

    if (!settings) {
      settings = await ServiceSettings.create({});
    }

    settings.globalRefillEnabled = !settings.globalRefillEnabled;

    await settings.save();

    res.json({
      message: `Refill globally ${
        settings.globalRefillEnabled ? "enabled" : "disabled"
      }`,
      globalRefillEnabled: settings.globalRefillEnabled,
    });
  } catch (err) {
    console.error("REFILL GLOBAL TOGGLE ERROR:", err);
    res.status(500).json({
      message: "Failed to toggle refill",
    });
  }
};

/* =========================================================
   🔥 TOGGLE CANCEL GLOBALLY
========================================================= */
export const toggleCancelGlobal = async (req, res) => {
  try {
    let settings = await ServiceSettings.findOne();

    if (!settings) {
      settings = await ServiceSettings.create({});
    }

    settings.globalCancelEnabled = !settings.globalCancelEnabled;

    await settings.save();

    res.json({
      message: `Cancel globally ${
        settings.globalCancelEnabled ? "enabled" : "disabled"
      }`,
      globalCancelEnabled: settings.globalCancelEnabled,
    });
  } catch (err) {
    console.error("CANCEL GLOBAL TOGGLE ERROR:", err);
    res.status(500).json({
      message: "Failed to toggle cancel",
    });
  }
};
