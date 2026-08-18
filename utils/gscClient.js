// utils/gscClient.js
import fs from "fs";
import { JWT } from "google-auth-library";

let client = null;

function loadCredentials() {
  // 1. Check explicit env var or fallback to Render's default Secret File path
  const credFilePath = process.env.GOOGLE_APPLICATION_CREDENTIALS || "/etc/secrets/keyfile.json";
  
  if (fs.existsSync(credFilePath)) {
    const fileData = fs.readFileSync(credFilePath, "utf8");
    return JSON.parse(fileData);
  }

  // 2. Local dev JSON string fallback
  const raw = process.env.GSC_CREDENTIALS;
  if (!raw) {
    throw new Error("Missing credentials. Neither the Secret File (/etc/secrets/keyfile.json) nor GSC_CREDENTIALS was found.");
  }

  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error("GSC_CREDENTIALS is not valid JSON.");
  }
}

export async function getGscClient() {
  if (client) return client;

  const credentials = loadCredentials();

  client = new JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
  });

  return client;
}

export function getPropertyUrl() {
  const url = process.env.GSC_PROPERTY_URL;
  if (!url) {
    throw new Error("GSC_PROPERTY_URL env var is not set.");
  }
  return url.trim();
}
