// utils/gateways/cryptomus.js
import axios from "axios";
import crypto from "crypto";

export const meta = {
  name: "cryptomus",
  label: "Cryptomus",
  credentialFields: [
    { key: "apiKey",     label: "Payment API Key", type: "password", required: true },
    { key: "merchantId", label: "Merchant UUID",   type: "text",     required: true },
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
