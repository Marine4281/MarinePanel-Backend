// utils/googleAnalyticsClient.js
//
// Wraps the GA4 Data API client. Supports two ways of supplying
// the service-account credentials:
//
//   1. GOOGLE_APPLICATION_CREDENTIALS — a file path to the raw
//      keyfile.json (used on Render via Secret Files, mounted at
//      /etc/secrets/keyfile.json).
//   2. GSC_CREDENTIALS — the full keyfile.json contents as a single
//      JSON string (used for local dev where there's no mounted
//      secret file).
//
// If GOOGLE_APPLICATION_CREDENTIALS is set, the Google client
// library reads it automatically — we don't even need to load it
// ourselves. GSC_CREDENTIALS is only parsed as a fallback.
//
// GSC_PROPERTY_URL still controls which GA4 property is queried
// (either a bare numeric ID or a full "properties/..." string).

import fs from "fs";
import { BetaAnalyticsDataClient } from "@google-analytics/data";

let client = null;

function getCredentialsFromEnvJson() {
  const raw = process.env.GSC_CREDENTIALS;

  if (!raw) {
    throw new Error(
      "Neither GOOGLE_APPLICATION_CREDENTIALS (file path) nor GSC_CREDENTIALS (JSON string) is set. Set one of them."
    );
  }

  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(
      "GSC_CREDENTIALS is not valid JSON. Make sure the entire keyfile.json content was pasted as a single-line JSON string (private_key newlines should stay as literal \\n escapes)."
    );
  }
}

export function getAnalyticsClient() {
  if (client) return client;

  const credFilePath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  // Preferred path: a Secret File on disk (Render).
  // The client library reads GOOGLE_APPLICATION_CREDENTIALS itself,
  // so we just need to confirm the file actually exists before
  // handing off — otherwise errors surface late and vaguely.
  if (credFilePath) {
    if (!fs.existsSync(credFilePath)) {
      throw new Error(
        `GOOGLE_APPLICATION_CREDENTIALS is set to "${credFilePath}" but no file exists there. Check the Secret File name/path in Render.`
      );
    }

    client = new BetaAnalyticsDataClient(); // auto-reads the file via the env var
    return client;
  }

  // Fallback: local dev, credentials pasted as a JSON string.
  const credentials = getCredentialsFromEnvJson();

  if (!credentials.client_email || !credentials.private_key) {
    throw new Error(
      "GSC_CREDENTIALS is missing client_email or private_key — check the pasted keyfile.json contents."
    );
  }

  client = new BetaAnalyticsDataClient({
    credentials: {
      client_email: credentials.client_email,
      private_key: credentials.private_key,
    },
    projectId: credentials.project_id,
  });

  return client;
}

// Accepts a bare numeric ID ("123456789") or a full resource
// string ("properties/123456789") and always returns the full form.
export function getPropertyId() {
  const raw = process.env.GSC_PROPERTY_URL;

  if (!raw) {
    throw new Error("GSC_PROPERTY_URL env var is not set.");
  }

  const trimmed = raw.trim();
  return trimmed.startsWith("properties/") ? trimmed : `properties/${trimmed}`;
}
