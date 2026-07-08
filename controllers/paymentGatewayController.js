// controllers/paymentGatewayController.js
// Barrel file — re-exports from the split controllers below so existing
// route imports (`from "../controllers/paymentGatewayController.js"`) keep working.

export {
  getProviders,
  getCpAvailableProviders,
  adminGetProviders,
  adminCreateProvider,
  adminUpdateProvider,
  adminDeleteProvider,
} from "./paymentProviderController.js";

export {
  getQuote,
  getUserGateways,
  initializePayment,
  handleWebhook,
  adminApproveDeposit,
  adminRejectDeposit,
  adminGetPendingDeposits,
  cpGetPendingDeposits,
  cpApproveDeposit,
  cpRejectDeposit,
} from "./depositController.js";

export {
  getUserWithdrawGateways,
  getWithdrawQuote,
  initializeWithdrawal,
  handlePayoutWebhook,
  adminGetPendingWithdrawals,
  adminApproveWithdrawal,
  adminRejectWithdrawal,
  cpGetPendingWithdrawals,
  cpApproveWithdrawal,
  cpRejectWithdrawal,
} from "./withdrawalController.js";

export {
  adminGetAllGateways,
  adminCreateGateway,
  adminUpdateGateway,
  adminDeleteGateway,
  adminToggleHidden,
  adminRotateWebhookToken,
} from "./adminGatewayController.js";

export {
  getCpGateways,
  connectPlatformGateway,
  createCpGateway,
  updateCpGateway,
  deleteCpGateway,
  rotateCpWebhookToken,
} from "./cpGatewayController.js";
