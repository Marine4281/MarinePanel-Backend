// utils/encryptCredentials.js
import crypto from "crypto";

const ALGO      = "aes-256-gcm";
const KEY       = Buffer.from(process.env.CREDENTIALS_ENCRYPTION_KEY, "hex");
const IV_LENGTH = 12;

export const encrypt = (text) => {
  if (!text) return "";
  const iv        = crypto.randomBytes(IV_LENGTH);
  const cipher    = crypto.createCipheriv(ALGO, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(String(text), "utf8"), cipher.final()]);
  const tag       = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
};

export const decrypt = (stored) => {
  if (!stored) return "";
  try {
    const [ivHex, tagHex, encryptedHex] = stored.split(":");
    const iv        = Buffer.from(ivHex, "hex");
    const tag       = Buffer.from(tagHex, "hex");
    const encrypted = Buffer.from(encryptedHex, "hex");
    const decipher  = crypto.createDecipheriv(ALGO, KEY, iv);
    decipher.setAuthTag(tag);
    return decipher.update(encrypted) + decipher.final("utf8");
  } catch {
    return "";
  }
};

export const encryptCredentials = (raw = {}) => ({
  // Paystack / Flutterwave / Kora
  secretKey:      encrypt(raw.secretKey),
  publicKey:      encrypt(raw.publicKey),
  encryptionKey:  encrypt(raw.encryptionKey),
  webhookSecret:  encrypt(raw.webhookSecret),

  // M-Pesa Daraja
  consumerKey:    encrypt(raw.consumerKey),
  consumerSecret: encrypt(raw.consumerSecret),
  shortcode:      encrypt(raw.shortcode),
  passkey:        encrypt(raw.passkey),

  // Binance Pay
  apiKey:         encrypt(raw.apiKey),

  // Cryptomus
  merchantId:     encrypt(raw.merchantId),
});

export const decryptCredentials = (stored = {}) => ({
  // Paystack / Flutterwave / Kora
  secretKey:      decrypt(stored.secretKey),
  publicKey:      decrypt(stored.publicKey),
  encryptionKey:  decrypt(stored.encryptionKey),
  webhookSecret:  decrypt(stored.webhookSecret),

  // M-Pesa Daraja
  consumerKey:    decrypt(stored.consumerKey),
  consumerSecret: decrypt(stored.consumerSecret),
  shortcode:      decrypt(stored.shortcode),
  passkey:        decrypt(stored.passkey),

  // Binance Pay
  apiKey:         decrypt(stored.apiKey),

  // Cryptomus
  merchantId:     decrypt(stored.merchantId),
});
