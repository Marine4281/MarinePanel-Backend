// utils/gateways/binance.js
import axios from "axios";
import crypto from "crypto";

export const meta = {
  name: "binance",
  label: "Binance Pay",
  credentialFields: [
    { key: "apiKey",    label: "API Key",    type: "text",     required: true },
    { key: "secretKey", label: "Secret Key", type: "password", required: true },
  ],
};

const BASE_URL = "https://bpay.binanceapi.com";

const buildSignature = (nonce, timestamp, body, secretKey) => {
  const payload = `${timestamp}\n${nonce}\n${body}\n`;
  return crypto.createHmac("sha512", secretKey).update(payload).digest("hex").toUpperCase();
};

export const initialize = async (credentials, { amount, currency, reference, callbackUrl }) => {
  const timestamp = Date.now().toString();
  const nonce     = crypto.randomBytes(16).toString("hex").toUpperCase();

  const body = JSON.stringify({
    env:             { terminalType: "WEB" },
    merchantTradeNo: reference,
    orderAmount:     Number(amount).toFixed(2),
    currency:        currency || "USDT",
    description:     "Wallet Deposit",
    returnUrl:       callbackUrl,
  });

  const signature = buildSignature(nonce, timestamp, body, credentials.secretKey);

  const response = await axios.post(`${BASE_URL}/binancepay/openapi/v2/order`, body, {
    headers: {
      "Content-Type":          "application/json",
      "BinancePay-Timestamp":  timestamp,
      "BinancePay-Nonce":      nonce,
      "BinancePay-Certificate-SN": credentials.apiKey,
      "BinancePay-Signature":  signature,
    },
  });

  if (response.data.status !== "SUCCESS") {
    throw new Error(response.data.errorMessage || "Binance Pay order creation failed");
  }

  return {
    authorization_url: response.data.data.checkoutUrl,
    reference,
  };
};

export const verify = async (credentials, reference) => {
  const timestamp = Date.now().toString();
  const nonce     = crypto.randomBytes(16).toString("hex").toUpperCase();

  const body = JSON.stringify({ merchantTradeNo: reference });
  const signature = buildSignature(nonce, timestamp, body, credentials.secretKey);

  const response = await axios.post(`${BASE_URL}/binancepay/openapi/v2/order/query`, body, {
    headers: {
      "Content-Type":              "application/json",
      "BinancePay-Timestamp":      timestamp,
      "BinancePay-Nonce":          nonce,
      "BinancePay-Certificate-SN": credentials.apiKey,
      "BinancePay-Signature":      signature,
    },
  });

  return (
    response.data.status === "SUCCESS" &&
    response.data.data?.status === "PAID"
  );
};

export const verifyWebhook = (credentials, req) => {
  const timestamp = req.headers["binancepay-timestamp"];
  const nonce     = req.headers["binancepay-nonce"];
  const body      = JSON.stringify(req.body);
  const expected  = buildSignature(nonce, timestamp, body, credentials.secretKey);
  return expected === req.headers["binancepay-signature"];
};

export const extractReference = (body) =>
  body?.bizData ? JSON.parse(body.bizData)?.merchantTradeNo : null;

export const payout = async (credentials, { amount, reference, recipient }) => {
  if (!recipient?.walletAddress) throw new Error("Recipient wallet address is required");

  const timestamp = Date.now();
  const params = new URLSearchParams({
    coin:        recipient.network || "USDT",
    address:     recipient.walletAddress,
    amount:      Number(amount).toFixed(2),
    withdrawOrderId: reference,
    timestamp:   timestamp.toString(),
  });
  if (recipient.addressTag) params.append("addressTag", recipient.addressTag);

  const signature = crypto
    .createHmac("sha256", credentials.secretKey)
    .update(params.toString())
    .digest("hex");
  params.append("signature", signature);

  const response = await axios.post(
    `https://api.binance.com/sapi/v1/capital/withdraw/apply?${params.toString()}`,
    null,
    { headers: { "X-MBX-APIKEY": credentials.apiKey } }
  );

  return {
    success:           true,
    status:             "pending",
    providerReference: response.data.id,
  };
};
