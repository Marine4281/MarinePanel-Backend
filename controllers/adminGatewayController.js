// controllers/adminGatewayController.js
import crypto from "crypto";
import PaymentGateway from "../models/PaymentGateway.js";
import { safeGateway } from "../utils/gatewayHelpers.js";

// ─── ADMIN: GATEWAY CRUD ─────────────────────────────────────────────
// Platform-level gateways only (owner: null). CP-owned gateways are
// managed exclusively from the CP owner's own dashboard.
export const adminGetAllGateways = async (req, res) => {
  try {
    const gateways = await PaymentGateway.find({ owner: null })
      .populate("providerProfile", "name providerType")
      .populate("owner", "email")
      .sort({ createdAt: -1 });
    res.json({ gateways: gateways.map(safeGateway) });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch gateways" });
  }
};

export const adminCreateGateway = async (req, res) => {
  try {
    const {
      name, description, paymentMode,
      providerProfile, binanceId, binanceName, qrImageUrl,
      manualType, manualConfig, paymentInstructions,
      processingCurrency, processingCurrencySymbol,
      exchangeRate, feeType, feePercentage, feeFixed,
      minDeposit, supportsWithdraw, minWithdraw, adminNote, cpNote,
      isVisible, visibleToCp,
    } = req.body;

    if (!name) return res.status(400).json({ message: "name is required" });

    const webhookToken = `wh_${crypto.randomBytes(24).toString("hex")}`;

    const gw = await PaymentGateway.create({
      owner:                    null,
      name,
      description:              description              || "",
      paymentMode:              paymentMode              || "hosted",
      providerProfile:          providerProfile          || null,
      binanceId:                binanceId                || "",
      binanceName:              binanceName              || "",
      qrImageUrl:               qrImageUrl               || "",
      manualType:               manualType               || null,
      manualConfig:             manualConfig             || {},
      paymentInstructions:      paymentInstructions      || "",
      processingCurrency:       processingCurrency       || "USD",
      processingCurrencySymbol: processingCurrencySymbol || "$",
      exchangeRate:             exchangeRate             || 1,
      feeType:                  feeType                  || "none",
      feePercentage:            feePercentage            || 0,
      feeFixed:                 feeFixed                 || 0,
      minDeposit:               minDeposit               || 0,
      supportsWithdraw:         supportsWithdraw === true,
      minWithdraw:              minWithdraw              || 0,
      adminNote:                adminNote                || "",
      cpNote:                   cpNote                   || "",
      isVisible:                isVisible  !== false,
      visibleToCp:              visibleToCp === true,
      webhookToken,
    });

    res.status(201).json({ message: "Gateway created", gateway: safeGateway(gw) });
  } catch (err) {
    console.error("adminCreateGateway error:", err);
    res.status(500).json({ message: "Failed to create gateway" });
  }
};

export const adminUpdateGateway = async (req, res) => {
  try {
    const gw = await PaymentGateway.findOne({ _id: req.params.id, owner: null });
    if (!gw) return res.status(404).json({ message: "Gateway not found" });

    const fields = [
      "name", "description", "paymentMode", "providerProfile",
      "binanceId", "binanceName", "qrImageUrl",
      "manualType", "manualConfig", "paymentInstructions",
      "processingCurrency", "processingCurrencySymbol", "exchangeRate",
      "feeType", "feePercentage", "feeFixed", "minDeposit",
      "supportsWithdraw", "minWithdraw",
      "adminNote", "cpNote", "isActive", "isVisible",
      "adminHidden", "visibleToCp",
    ];

    // These fields must be null, not "", or Mongoose rejects them
    // (providerProfile is an ObjectId ref, manualType is an enum with null default)
    const nullIfEmpty = ["providerProfile", "manualType"];

    fields.forEach((f) => {
      if (req.body[f] !== undefined) {
        let val = req.body[f];
        if (nullIfEmpty.includes(f) && val === "") val = null;
        gw[f] = val;
      }
    });

    await gw.save();

    res.json({ message: "Gateway updated", gateway: safeGateway(gw) });
  } catch (err) {
    console.error("adminUpdateGateway error:", err.message);
    res.status(500).json({ message: err.message || "Failed to update gateway" });
  }
};

export const adminDeleteGateway = async (req, res) => {
  try {
    const gw = await PaymentGateway.findOneAndDelete({ _id: req.params.id, owner: null });
    if (!gw) return res.status(404).json({ message: "Gateway not found" });
    res.json({ message: "Gateway deleted" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete gateway" });
  }
};

export const adminToggleHidden = async (req, res) => {
  try {
    const gw = await PaymentGateway.findOne({ _id: req.params.id, owner: null });
    if (!gw) return res.status(404).json({ message: "Gateway not found" });
    gw.adminHidden = !gw.adminHidden;
    await gw.save();
    res.json({ message: `Gateway ${gw.adminHidden ? "hidden" : "visible"}`, adminHidden: gw.adminHidden });
  } catch (err) {
    res.status(500).json({ message: "Failed to toggle" });
  }
};

export const adminRotateWebhookToken = async (req, res) => {
  try {
    const gw = await PaymentGateway.findById(req.params.id);
    if (!gw) return res.status(404).json({ message: "Gateway not found" });
    gw.webhookToken = `wh_${crypto.randomBytes(24).toString("hex")}`;
    await gw.save();
    res.json({ message: "Token rotated", webhookToken: gw.webhookToken });
  } catch (err) {
    res.status(500).json({ message: "Failed to rotate token" });
  }
};
