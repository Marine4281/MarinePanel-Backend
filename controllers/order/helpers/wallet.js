import Wallet from "../../../models/Wallet.js";
import User from "../../../models/User.js";
import { calcBalance } from "../../../utils/gatewayHelpers.js";

// ✅ Re-export the canonical calculation so createOrder.js and
// commissions.js (which import { calculateBalance } from here) get
// the correct, consistent logic without touching their code.
export const calculateBalance = calcBalance;

export const ensureWallet = async (userId) => {
  let wallet = await Wallet.findOne({ user: userId });

  if (!wallet) {
    wallet = await Wallet.create({
      user: userId,
      balance: 0,
      transactions: [],
    });
  }

  return wallet;
};

export const updateUserBalance = async (userId, wallet) => {
  await User.findByIdAndUpdate(userId, {
    balance: wallet.balance,
  });
};
