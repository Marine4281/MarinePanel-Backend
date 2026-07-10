// controllers/adminUserController.js
// Barrel file — re-exports from the split controllers below so existing
// route imports (`from "../controllers/adminUserController.js"`) keep working.

export {
  getAllUsers,
  getUserById,
  getUserOrders,
  getUserTransactions,
} from "./adminUserQueryController.js";

export {
  updateUserBalance,
  updateUserCommission,
} from "./adminUserBalanceController.js";

export {
  promoteToAdmin,
  demoteFromAdmin,
  blockUser,
  unblockUser,
  freezeUser,
  unfreezeUser,
  deleteUser,
} from "./adminUserStatusController.js";
