// utils/encryptCredentials.js
import crypto from "crypto";

const ALGO      = "aes-256-gcm";
const KEY       = Buffer.from(process.env.CREDENTIALS_ENCRYPTION_KEY, "hex"); // 32 bytes = 64 hex chars
const IV_LENGTH = 12; // GCM standard

// Add CREDENTIALS_ENCRYPTION_KEY to your .env:
// node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

export const encrypt = (text) => {
  if (!text) return "";
  const iv        = crypto.randomBytes(IV_LENGTH);
  const cipher    = crypto.createCipheriv(ALGO, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(String(text), "utf8"), cipher.final()]);
  const tag       = cipher.getAuthTag();
  // Store as: iv:tag:encrypted (all hex)
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

// Encrypt all credential fields before saving to DB
export const encryptCredentials = (raw = {}) => ({
  secretKey:      encrypt(raw.secretKey),
  publicKey:      encrypt(raw.publicKey),
  encryptionKey:  encrypt(raw.encryptionKey),
  webhookSecret:  encrypt(raw.webhookSecret),
  consumerKey:    encrypt(raw.consumerKey),
  consumerSecret: encrypt(raw.consumerSecret),
  shortcode:      encrypt(raw.shortcode),
  passkey:        encrypt(raw.passkey),
});

// Decrypt all credential fields for use at payment time
export const decryptCredentials = (stored = {}) => ({
  secretKey:      decrypt(stored.secretKey),
  publicKey:      decrypt(stored.publicKey),
  encryptionKey:  decrypt(stored.encryptionKey),
  webhookSecret:  decrypt(stored.webhookSecret),
  consumerKey:    decrypt(stored.consumerKey),
  consumerSecret: decrypt(stored.consumerSecret),
  shortcode:      decrypt(stored.shortcode),
  passkey:        decrypt(stored.passkey),
});
