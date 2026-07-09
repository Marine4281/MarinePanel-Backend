// controllers/currencyController.js
import Currency from "../models/Currency.js";

const safeCurrency = (c) => ({
  _id:       c._id,
  name:      c.name,
  code:      c.code,
  symbol:    c.symbol,
  rate:      c.rate,
  isDefault: c.isDefault,
  isActive:  c.isActive,
});

// ─── HELPER: enforce single default per owner scope ──────────────────
const clearOtherDefaults = async (owner, exceptId = null) => {
  await Currency.updateMany(
    { owner, _id: { $ne: exceptId } },
    { $set: { isDefault: false } }
  );
};

// ══════════════════════════════════════════════════════════════════
// ADMIN (main platform, owner: null)
// ══════════════════════════════════════════════════════════════════
export const adminGetCurrencies = async (req, res) => {
  try {
    const currencies = await Currency.find({ owner: null }).sort({ createdAt: -1 });
    res.json({ currencies: currencies.map(safeCurrency) });
  } catch (err) {
    console.error("adminGetCurrencies error:", err);
    res.status(500).json({ message: "Failed to fetch currencies" });
  }
};

export const adminCreateCurrency = async (req, res) => {
  try {
    const { name, code, symbol, rate, isDefault } = req.body;
    if (!name || !code || !symbol || rate === undefined) {
      return res.status(400).json({ message: "name, code, symbol, and rate are required" });
    }

    const currency = await Currency.create({
      owner: null,
      name,
      code:   code.toUpperCase(),
      symbol,
      rate,
      isDefault: isDefault === true,
    });

    if (currency.isDefault) await clearOtherDefaults(null, currency._id);

    res.status(201).json({ message: "Currency created", currency: safeCurrency(currency) });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: "That currency code already exists" });
    }
    console.error("adminCreateCurrency error:", err);
    res.status(500).json({ message: "Failed to create currency" });
  }
};

export const adminUpdateCurrency = async (req, res) => {
  try {
    const currency = await Currency.findOne({ _id: req.params.id, owner: null });
    if (!currency) return res.status(404).json({ message: "Currency not found" });

    const { name, code, symbol, rate, isDefault, isActive } = req.body;
    if (name   !== undefined) currency.name   = name;
    if (code   !== undefined) currency.code   = code.toUpperCase();
    if (symbol !== undefined) currency.symbol = symbol;
    if (rate   !== undefined) currency.rate   = rate;
    if (isActive !== undefined) currency.isActive = isActive;
    if (isDefault !== undefined) currency.isDefault = isDefault === true;

    await currency.save();
    if (currency.isDefault) await clearOtherDefaults(null, currency._id);

    res.json({ message: "Currency updated", currency: safeCurrency(currency) });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: "That currency code already exists" });
    }
    console.error("adminUpdateCurrency error:", err);
    res.status(500).json({ message: "Failed to update currency" });
  }
};

export const adminDeleteCurrency = async (req, res) => {
  try {
    const currency = await Currency.findOneAndDelete({ _id: req.params.id, owner: null });
    if (!currency) return res.status(404).json({ message: "Currency not found" });
    res.json({ message: "Currency deleted" });
  } catch (err) {
    console.error("adminDeleteCurrency error:", err);
    res.status(500).json({ message: "Failed to delete currency" });
  }
};

// ══════════════════════════════════════════════════════════════════
// CP OWNER (their own list, owner: req.user._id)
// ══════════════════════════════════════════════════════════════════
export const getCpCurrencies = async (req, res) => {
  try {
    const currencies = await Currency.find({ owner: req.user._id }).sort({ createdAt: -1 });
    res.json({ currencies: currencies.map(safeCurrency) });
  } catch (err) {
    console.error("getCpCurrencies error:", err);
    res.status(500).json({ message: "Failed to fetch currencies" });
  }
};

export const createCpCurrency = async (req, res) => {
  try {
    const { name, code, symbol, rate, isDefault } = req.body;
    if (!name || !code || !symbol || rate === undefined) {
      return res.status(400).json({ message: "name, code, symbol, and rate are required" });
    }

    const currency = await Currency.create({
      owner: req.user._id,
      name,
      code:   code.toUpperCase(),
      symbol,
      rate,
      isDefault: isDefault === true,
    });

    if (currency.isDefault) await clearOtherDefaults(req.user._id, currency._id);

    res.status(201).json({ message: "Currency created", currency: safeCurrency(currency) });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: "That currency code already exists" });
    }
    console.error("createCpCurrency error:", err);
    res.status(500).json({ message: "Failed to create currency" });
  }
};

export const updateCpCurrency = async (req, res) => {
  try {
    const currency = await Currency.findOne({ _id: req.params.id, owner: req.user._id });
    if (!currency) return res.status(404).json({ message: "Currency not found" });

    const { name, code, symbol, rate, isDefault, isActive } = req.body;
    if (name   !== undefined) currency.name   = name;
    if (code   !== undefined) currency.code   = code.toUpperCase();
    if (symbol !== undefined) currency.symbol = symbol;
    if (rate   !== undefined) currency.rate   = rate;
    if (isActive !== undefined) currency.isActive = isActive;
    if (isDefault !== undefined) currency.isDefault = isDefault === true;

    await currency.save();
    if (currency.isDefault) await clearOtherDefaults(req.user._id, currency._id);

    res.json({ message: "Currency updated", currency: safeCurrency(currency) });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: "That currency code already exists" });
    }
    console.error("updateCpCurrency error:", err);
    res.status(500).json({ message: "Failed to update currency" });
  }
};

export const deleteCpCurrency = async (req, res) => {
  try {
    const currency = await Currency.findOneAndDelete({ _id: req.params.id, owner: req.user._id });
    if (!currency) return res.status(404).json({ message: "Currency not found" });
    res.json({ message: "Currency deleted" });
  } catch (err) {
    console.error("deleteCpCurrency error:", err);
    res.status(500).json({ message: "Failed to delete currency" });
  }
};

// ══════════════════════════════════════════════════════════════════
// END USER — scoped the same way getUserGateways scopes gateways
// ══════════════════════════════════════════════════════════════════
export const getUserCurrencies = async (req, res) => {
  try {
    const user = req.user;
    const ownerFilter = user.childPanelOwner || null;

    const currencies = await Currency.find({ owner: ownerFilter, isActive: true }).sort({ name: 1 });
    res.json({
      currencies: currencies.map(safeCurrency),
      selectedCurrency: user.selectedCurrency || null,
    });
  } catch (err) {
    console.error("getUserCurrencies error:", err);
    res.status(500).json({ message: "Failed to fetch currencies" });
  }
};

// ─── USER: SAVE SELECTED CURRENCY ────────────────────────────────────
export const selectUserCurrency = async (req, res) => {
  try {
    const { currencyId } = req.body;
    const user = req.user;
    const ownerFilter = user.childPanelOwner || null;

    // null is valid — means "reset to USD"
    if (currencyId) {
      const currency = await Currency.findOne({
        _id: currencyId,
        owner: ownerFilter,
        isActive: true,
      });
      if (!currency) return res.status(404).json({ message: "Currency not found" });
    }

    user.selectedCurrency = currencyId || null;
    await user.save();

    res.json({ message: "Currency preference saved", selectedCurrency: currencyId || null });
  } catch (err) {
    console.error("selectUserCurrency error:", err);
    res.status(500).json({ message: "Failed to save currency preference" });
  }
};
