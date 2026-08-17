import Wallet from "../../../models/Wallet.js";

export const handleBalance = async (req, res, user) => {
  const wallet = await Wallet.findOne({ user: user._id });

  return res.json({
    balance: wallet?.balance?.toFixed(5) || "0.00000",
    currency: "USD",
  });
};
