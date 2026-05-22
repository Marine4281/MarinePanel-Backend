import Wallet from "../../../models/Wallet.js";
import User from "../../../models/User.js";

export const calculateBalance = (transactions = []) =>
  transactions.reduce((acc, t) => acc + (t.amount || 0), 0);

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
