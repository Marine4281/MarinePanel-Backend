// utils/gatewayHelpers.js
import Wallet from "../models/Wallet.js";

export const calcBalance = (transactions = []) =>
  transactions
    .filter((t) => t.status === "Completed")
    .reduce((acc, t) => acc + (Number(t.amount) || 0), 0);

export const safeGateway = (gw) => ({
  _id:                      gw._id,
  name:                     gw.name,
  description:              gw.description,
  paymentMode:              gw.paymentMode,
  binanceId:                gw.binanceId,
  binanceName:              gw.binanceName,
  qrImageUrl:               gw.qrImageUrl,
  manualType:               gw.manualType,
  manualConfig:             gw.manualConfig,
  paymentInstructions:      gw.paymentInstructions,
  processingCurrency:       gw.processingCurrency,
  processingCurrencySymbol: gw.processingCurrencySymbol,
  exchangeRate:             gw.exchangeRate,
  feeType:                  gw.feeType,
  feePercentage:            gw.feePercentage,
  feeFixed:                 gw.feeFixed,
  adminNote:                gw.adminNote,
  cpNote:                   gw.cpNote,
  minDeposit:               gw.minDeposit,
  supportsWithdraw:         gw.supportsWithdraw,
  minWithdraw:              gw.minWithdraw,
  isActive:                 gw.isActive,
  isVisible:                gw.isVisible,
  adminHidden:              gw.adminHidden,
  visibleToCp:              gw.visibleToCp,
  webhookToken:             gw.webhookToken,
  providerProfile:          gw.providerProfile,
  owner:                    gw.owner,
  createdAt:                gw.createdAt,
  providerType:             gw.providerProfile?.providerType || null,
});

export const safeProvider = (p) => ({
  _id:          p._id,
  name:         p.name,
  providerType: p.providerType,
  isActive:     p.isActive,
  owner:        p.owner,
  createdAt:    p.createdAt,
  // credentials intentionally omitted
  hasCredentials: !!(p.credentials?.secretKey || p.credentials?.apiKey || p.credentials?.consumerKey),
});

// Wallet balance minus locked pending withdrawals
export const getAvailableBalance = async (userId) => {
  const wallet = await Wallet.findOne({ user: userId });
  if (!wallet) return { wallet: null, available: 0 };

  const pendingWithdrawals = wallet.transactions
    .filter((t) => t.type === "Withdrawal" && t.status === "Pending")
    .reduce((acc, t) => acc + Math.abs(Number(t.amount) || 0), 0);

  return { wallet, available: wallet.balance - pendingWithdrawals };
};
