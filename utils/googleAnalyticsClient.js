// utils/googleAnalyticsClient.js
//
// Wraps the GA4 Data API client. Credentials come from the
// GSC_CREDENTIALS env var (the full service-account keyfile.json
// contents, as one JSON string) and the property comes from
// GSC_PROPERTY_URL (either a bare numeric property ID, e.g.
// "123456789", or a full "properties/123456789" string — both work).

import { BetaAnalyticsDataClient } from "@google-analytics/data";

let client = null;

function getCredentials() {
  const raw = process.env.GSC_CREDENTIALS;

  if (!raw) {
    throw new Error(
      "GSC_CREDENTIALS env var is not set. Paste the full keyfile.json contents as this variable's value."
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

  const credentials = getCredentials();

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
