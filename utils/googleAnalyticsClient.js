// utils/gscClient.js
const fs = require("fs");
const { JWT } = require("google-auth-library");

let client = null;

function loadCredentials() {
  // 1. Render Secret File path check
  const credFilePath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (credFilePath) {
    if (!fs.existsSync(credFilePath)) {
      throw new Error(`GOOGLE_APPLICATION_CREDENTIALS points to "${credFilePath}", but the file does not exist.`);
    }
    const fileData = fs.readFileSync(credFilePath, "utf8");
    return JSON.parse(fileData);
  }

  // 2. Local dev JSON string fallback
  const raw = process.env.GSC_CREDENTIALS;
  if (!raw) {
    throw new Error("Missing credentials. Set either GOOGLE_APPLICATION_CREDENTIALS or GSC_CREDENTIALS.");
  }

  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error("GSC_CREDENTIALS is not valid JSON.");
  }
}

async function getGscClient() {
  if (client) return client;

  const credentials = loadCredentials();

  client = new JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
  });

  return client;
}

function getPropertyUrl() {
  const url = process.env.GSC_PROPERTY_URL;
  if (!url) {
    throw new Error("GSC_PROPERTY_URL env var is not set.");
  }
  return url.trim();
}

module.exports = { getGscClient, getPropertyUrl };
