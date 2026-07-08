// utils/gateways/cryptomus.js
import axios from "axios";
import crypto from "crypto";

export const meta = {
  name: "cryptomus",
  label: "Cryptomus",
  credentialFields: [
    { key: "apiKey",       label: "Payment API Key", type: "password", required: true },
    { key: "merchantId",   label: "Merchant UUID",   type: "text",     required: true },
    { key: "payoutApiKey", label: "Payout API Key",  type: "password", required: false },
  ],
};

const BASE_URL = "https://api.cryptomus.com/v1";

const buildSign = (data, apiKey) => {
  const base64 = Buffer.from(JSON.stringify(data)).toString("base64");
  return crypto.createHash("md5").update(base64 + apiKey).digest("hex");
};

export const initialize = async (credentials, { amount, currency, reference, callbackUrl }) => {
  const data = {
    amount:      String(Number(amount).toFixed(2)),
    currency:    currency || "USD",        // invoice currency
    order_id:    reference,
    url_callback: callbackUrl,
    url_return:   callbackUrl,
    lifetime:    3600,                     // 1 hour to pay
  };

  const sign = buildSign(data, credentials.apiKey);

  const response = await axios.post(`${BASE_URL}/payment`, data, {
    headers: {
      merchant:     credentials.merchantId,
      sign,
      "Content-Type": "application/json",
    },
  });

  if (response.data.state !== 0) {
    throw new Error(response.data.message || "Cryptomus invoice creation failed");
  }

  return {
    authorization_url: response.data.result.url,
    reference,
  };
};

export const verify = async (credentials, reference) => {
  const data = { order_id: reference };
  const sign = buildSign(data, credentials.apiKey);

  const response = await axios.post(`${BASE_URL}/payment/info`, data, {
    headers: {
      merchant:       credentials.merchantId,
      sign,
      "Content-Type": "application/json",
    },
  });

  const status = response.data.result?.payment_status;
  // paid, paid_over = confirmed payment
  return status === "paid" || status === "paid_over";
};

export const verifyWebhook = (credentials, req) => {
  const received = req.body.sign;
  if (!received) return false;

  // Cryptomus sends sign in body — remove it before verifying
  const payload = { ...req.body };
  delete payload.sign;

  const expected = buildSign(payload, credentials.apiKey);
  return expected === received;
};

export const extractReference = (body) => body?.order_id || null;

export const payout = async (credentials, { amount, currency, reference, recipient }) => {
  if (!recipient?.walletAddress) throw new Error("Recipient wallet address is required");
  if (!recipient?.network) throw new Error("Recipient network (e.g. TRON, BSC, ETH) is required");

  const payoutKey = credentials.payoutApiKey || credentials.apiKey;

  const data = {
    amount:      String(Number(amount).toFixed(2)),
    currency:    currency || "USDT",
    network:     recipient.network,
    address:     recipient.walletAddress,
    is_subtract: 1,          // deduct network fee from the payout amount, not the merchant balance
    order_id:    reference,
  };

  const sign = buildSign(data, payoutKey);

  const response = await axios.post(`${BASE_URL}/payout`, data, {
    headers: {
      merchant:       credentials.merchantId,
      sign,
      "Content-Type": "application/json",
    },
  });

  if (response.data.state !== 0) {
    throw new Error(response.data.message || "Cryptomus payout failed");
  }

  return {
    success:           true,
    status:            response.data.result.status === "paid" ? "completed" : "pending",
    providerReference: response.data.result.uuid,
  };
};

export const verifyPayout = async (credentials, providerReference) => {
  const payoutKey = credentials.payoutApiKey || credentials.apiKey;
  const data = { uuid: providerReference };
  const sign = buildSign(data, payoutKey);

  const response = await axios.post(`${BASE_URL}/payout/info`, data, {
    headers: {
      merchant:       credentials.merchantId,
      sign,
      "Content-Type": "application/json",
    },
  });

  const status = response.data.result?.status;
  return status === "paid";
};
