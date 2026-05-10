// utils/gateways/paystack.js
import axios from "axios";
import crypto from "crypto";

export const meta = {
  name: "paystack",
  label: "Paystack",
  credentialFields: [
    { key: "secretKey", label: "Secret Key", type: "password", required: true },
    { key: "publicKey", label: "Public Key", type: "text",     required: true },
  ],
};

export const initialize = async (credentials, { amount, currency, email, reference, callbackUrl }) => {
  const amountInSmallestUnit = Math.round(amount * 100); // kobo / pesewas
  const response = await axios.post(
    "https://api.paystack.co/transaction/initialize",
    { email, amount: amountInSmallestUnit, currency, reference, callback_url: callbackUrl },
    { headers: { Authorization: `Bearer ${credentials.secretKey}` } }
  );
  return { authorization_url: response.data.data.authorization_url, reference };
};

export const verify = async (credentials, reference) => {
  const response = await axios.get(
    `https://api.paystack.co/transaction/verify/${reference}`,
    { headers: { Authorization: `Bearer ${credentials.secretKey}` } }
  );
  return response.data.data.status === "success";
};

export const verifyWebhook = (credentials, req) => {
  const hash = crypto
    .createHmac("sha512", credentials.secretKey)
    .update(JSON.stringify(req.body))
    .digest("hex");
  return hash === req.headers["x-paystack-signature"];
};

export const extractReference = (body) => body?.data?.reference || null;
