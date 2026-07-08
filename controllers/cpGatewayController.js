// controllers/cpGatewayController.js
import crypto from "crypto";
import PaymentGateway  from "../models/PaymentGateway.js";
import PaymentProvider from "../models/PaymentProvider.js";
import { safeGateway } from "../utils/gatewayHelpers.js";

// ─── CP OWNER: GET GATEWAYS ──────────────────────────────────────────
// Returns platform gateways where visibleToCp=true (read-only, can connect)
// plus the CP owner's own gateways.
export const getCpGateways = async (req, res) => {
  try {
    const [platformGateways, ownGateways] = await Promise.all([
      PaymentGateway.find({ owner: null, visibleToCp: true, adminHidden: false })
        .populate("providerProfile", "providerType name"),
      PaymentGateway.find({ owner: req.user._id })
        .populate("providerProfile", "providerType name"),
    ]);

    res.json({
      platformGateways: platformGateways.map(safeGateway),
      ownGateways:      ownGateways.map(safeGateway),
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch gateways" });
  }
};

// ─── CP OWNER: CONNECT PLATFORM GATEWAY ─────────────────────────────
export const connectPlatformGateway = async (req, res) => {
  try {
    const { platformGatewayId } = req.body;

    const platform = await PaymentGateway.findOne({
      _id:         platformGatewayId,
      owner:       null,
      visibleToCp: true,
      adminHidden: false,
    }).populate("providerProfile");

    if (!platform) {
      return res.status(404).json({ message: "Platform gateway not found" });
    }

    const existing = await PaymentGateway.findOne({
      owner:             req.user._id,
      platformGatewayRef: platformGatewayId,
    });

    if (existing) {
      return res.status(400).json({ message: "Already connected to this gateway" });
    }

    const webhookToken = `wh_${crypto.randomBytes(24).toString("hex")}`;

    const gw = await PaymentGateway.create({
      owner:                    req.user._id,
      platformGatewayRef:       platformGatewayId,
      name:                     platform.name,
      description:              platform.description,
      paymentMode:              platform.paymentMode,
      providerProfile:          platform.providerProfile?._id || null,
      binanceId:                platform.binanceId,
      paymentInstructions:      platform.paymentInstructions,
      processingCurrency:       platform.processingCurrency,
      processingCurrencySymbol: platform.processingCurrencySymbol,
      exchangeRate:             platform.exchangeRate,
      depositFeeType:           platform.depositFeeType,
      depositFeePercentage:     platform.depositFeePercentage,
      depositFeeFixed:          platform.depositFeeFixed,
      withdrawalFeeType:        platform.withdrawalFeeType,
      withdrawalFeePercentage:  platform.withdrawalFeePercentage,
      withdrawalFeeFixed:       platform.withdrawalFeeFixed,
      minDeposit:               platform.minDeposit,
      supportsWithdraw:         platform.supportsWithdraw,
      minWithdraw:              platform.minWithdraw,
      adminNote:                platform.adminNote,
      isVisible:                true,
      visibleToCp:              false,
      isPlatformConnected:      true,
      webhookToken,
    });

    res.status(201).json({ message: "Gateway connected", gateway: safeGateway(gw) });
  } catch (err) {
    console.error("connectPlatformGateway error:", err);
    res.status(500).json({ message: "Failed to connect gateway" });
  }
};

// ─── CP OWNER: CREATE OWN GATEWAY ────────────────────────────────────
export const createCpGateway = async (req, res) => {
  try {
    const {
      name, description, paymentMode,
      providerProfile, binanceId, binanceName, qrImageUrl,
      manualType, manualConfig, paymentInstructions,
      processingCurrency, processingCurrencySymbol,
      exchangeRate,
      depositFeeType, depositFeePercentage, depositFeeFixed,
      withdrawalFeeType, withdrawalFeePercentage, withdrawalFeeFixed,
      minDeposit, supportsWithdraw, minWithdraw, cpNote, isVisible,
    } = req.body;

    if (!name) return res.status(400).json({ message: "name is required" });

    if (providerProfile) {
      const provider = await PaymentProvider.findOne({
        _id:         providerProfile,
        owner:       null,
        visibleToCp: true,
        isActive:    true,
      });
      if (!provider) {
        return res.status(400).json({ message: "Selected provider is not available" });
      }
    }

    const webhookToken = `wh_${crypto.randomBytes(24).toString("hex")}`;

    const gw = await PaymentGateway.create({
      owner:                    req.user._id,
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
      depositFeeType:           depositFeeType           || "none",
      depositFeePercentage:     depositFeePercentage     || 0,
      depositFeeFixed:          depositFeeFixed          || 0,
      withdrawalFeeType:        withdrawalFeeType        || "none",
      withdrawalFeePercentage:  withdrawalFeePercentage  || 0,
      withdrawalFeeFixed:       withdrawalFeeFixed       || 0,
      minDeposit:               minDeposit               || 0,
      supportsWithdraw:         supportsWithdraw === true,
      minWithdraw:              minWithdraw              || 0,
      cpNote:                   cpNote                   || "",
      isVisible:                isVisible !== false,
      visibleToCp:              false,
      webhookToken,
    });

    res.status(201).json({ message: "Gateway created", gateway: safeGateway(gw) });
  } catch (err) {
    res.status(500).json({ message: "Failed to create gateway" });
  }
};

export const updateCpGateway = async (req, res) => {
  try {
    const gw = await PaymentGateway.findOne({ _id: req.params.id, owner: req.user._id });
    if (!gw) return res.status(404).json({ message: "Gateway not found" });

    const allowed = [
      "name", "description", "paymentMode",
      "binanceId", "binanceName", "qrImageUrl",
      "manualType", "manualConfig", "paymentInstructions",
      "processingCurrency", "processingCurrencySymbol", "exchangeRate",
      "depositFeeType", "depositFeePercentage", "depositFeeFixed",
      "withdrawalFeeType", "withdrawalFeePercentage", "withdrawalFeeFixed",
      "minDeposit",
      "supportsWithdraw", "minWithdraw",
      "cpNote", "isActive", "isVisible",
    ];

    allowed.forEach((f) => {
      if (req.body[f] !== undefined) {
        let val = req.body[f];
        if (f === "manualType" && val === "") val = null;
        gw[f] = val;
      }
    });

    await gw.save();

    res.json({ message: "Gateway updated", gateway: safeGateway(gw) });
  } catch (err) {
    console.error("updateCpGateway error:", err.message);
    res.status(500).json({ message: err.message || "Failed to update gateway" });
  }
};

// ─── CP OWNER: DELETE OWN GATEWAY ────────────────────────────────────
export const deleteCpGateway = async (req, res) => {
  try {
    const gw = await PaymentGateway.findOneAndDelete({ _id: req.params.id, owner: req.user._id });
    if (!gw) return res.status(404).json({ message: "Gateway not found" });
    res.json({ message: "Gateway deleted" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete gateway" });
  }
};
