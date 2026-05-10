// utils/gateways/kora.js
import axios from "axios";
import crypto from "crypto";

export const meta = {
  name: "kora",
  label: "Kora",
  credentialFields: [
    { key: "secretKey", label: "Secret Key", type: "password", required: true },
    { key: "publicKey", label: "Public Key", type: "text",     required: false },
  ],
};

export const initialize = async (credentials, { amount, currency, email, reference, callbackUrl }) => {
  const response = await axios.post(
    "https://api.korapay.com/merchant/api/v1/charges/initialize",
    {
      reference,
      amount,
      currency,
      customer: { email },
      redirect_url: callbackUrl,
    },
    { headers: { Authorization: `Bearer ${credentials.secretKey}` } }
  );
  return { authorization_url: response.data.data.checkout_url, reference };
};

export const verify = async (credentials, reference) => {
  const response = await axios.get(
    `https://api.korapay.com/merchant/api/v1/charges/${reference}`,
    { headers: { Authorization: `Bearer ${credentials.secretKey}` } }
  );
  return response.data.data.status === "success";
};

export const verifyWebhook = (credentials, req) => {
  const hash = crypto
    .createHmac("sha256", credentials.secretKey)
    .update(JSON.stringify(req.body))
    .digest("hex");
  return hash === req.headers["x-korapay-signature"];
};

export const extractReference = (body) => body?.data?.reference || null;
