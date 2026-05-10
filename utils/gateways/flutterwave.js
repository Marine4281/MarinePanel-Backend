// utils/gateways/flutterwave.js
import axios from "axios";
import crypto from "crypto";

export const meta = {
  name: "flutterwave",
  label: "Flutterwave",
  credentialFields: [
    { key: "secretKey",     label: "Secret Key",     type: "password", required: true },
    { key: "publicKey",     label: "Public Key",     type: "text",     required: true },
    { key: "encryptionKey", label: "Encryption Key", type: "password", required: true },
    { key: "webhookSecret", label: "Webhook Secret", type: "password", required: false },
  ],
};

export const initialize = async (credentials, { amount, currency, email, reference, callbackUrl }) => {
  const response = await axios.post(
    "https://api.flutterwave.com/v3/payments",
    {
      tx_ref: reference,
      amount,
      currency,
      redirect_url: callbackUrl,
      customer: { email },
      customizations: { title: "Deposit" },
    },
    { headers: { Authorization: `Bearer ${credentials.secretKey}` } }
  );
  return { authorization_url: response.data.data.link, reference };
};

export const verify = async (credentials, reference) => {
  const response = await axios.get(
    `https://api.flutterwave.com/v3/transactions/${reference}/verify`,
    { headers: { Authorization: `Bearer ${credentials.secretKey}` } }
  );
  return response.data.data.status === "successful";
};

export const verifyWebhook = (credentials, req) => {
  const secret = credentials.webhookSecret;
  if (!secret) return false;
  return req.headers["verif-hash"] === secret;
};

export const extractReference = (body) => body?.data?.tx_ref || null;
