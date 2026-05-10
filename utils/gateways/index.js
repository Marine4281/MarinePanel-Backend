// utils/gateways/index.js
import * as paystack    from "./paystack.js";
import * as flutterwave from "./flutterwave.js";
import * as mpesa       from "./mpesa.js";
import * as kora        from "./kora.js";

// ─── REGISTRY ────────────────────────────────────────────────────────
// To add a new provider: create the file, import it, add it here. Done.
const gateways = { paystack, flutterwave, mpesa, kora };

export const getGateway = (provider) => gateways[provider] || null;

// Returns meta for all providers — drives the dynamic frontend form
export const getProvidersMeta = () =>
  Object.values(gateways).map((g) => g.meta);
