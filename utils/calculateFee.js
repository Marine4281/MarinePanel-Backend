// utils/calculateFee.js

// All amounts are in processingCurrency (e.g. KES, NGN)
export const calculateFee = (localAmount, feeType, feePercentage, feeFixed) => {
  let fee = 0;

  if (feeType === "fixed") {
    fee = Number(feeFixed) || 0;
  } else if (feeType === "percentage") {
    fee = (localAmount * (Number(feePercentage) || 0)) / 100;
  } else if (feeType === "both") {
    fee =
      (localAmount * (Number(feePercentage) || 0)) / 100 +
      (Number(feeFixed) || 0);
  }

  fee = Math.round(fee * 100) / 100;

  return {
    depositAmount: localAmount,          // what gets credited to wallet (in local currency)
    fee,                                 // processing fee
    total: Math.round((localAmount + fee) * 100) / 100, // what provider actually charges
  };
};
