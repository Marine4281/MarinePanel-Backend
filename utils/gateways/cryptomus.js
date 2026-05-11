// utils/gateways/index.js
import * as paystack    from "./paystack.js";
import * as flutterwave from "./flutterwave.js";
import * as mpesa       from "./mpesa.js";
import * as kora        from "./kora.js";
import * as binance     from "./binance.js";
import * as cryptomus   from "./cryptomus.js";

const gateways = { paystack, flutterwave, mpesa, kora, binance, cryptomus };

export const getGateway = (provider) => gateways[provider] || null;

export const getProvidersMeta = () =>
  Object.values(gateways).map((g) => g.meta);
