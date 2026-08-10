// utils/resolveLiveGateway.js
//
// A platform-connected CP gateway (gw.isPlatformConnected === true) does
// NOT own its money-routing/instruction fields — it's just a pointer
// (platformGatewayRef) to the real platform gateway. Those fields are
// resolved live here, on every read/use, instead of being frozen at
// connect time — so when admin edits the platform gateway's manual
// instructions, phone number, QR code, or provider credentials, every
// CP riding on it picks up the change immediately, with no backfill
// or "reconnect to refresh" step ever needed again.
//
// CP-owned fields (name, description, fees, min amounts, visibility,
// cpNote) are NOT touched here — CP owners can set their own markup/
// display on top of a connected gateway, same as before.
//
// Mutates the passed doc/object in place and returns it. Safe no-op
// for non-connected gateways.

import PaymentGateway from "../models/PaymentGateway.js";

const LIVE_FIELDS = [
  "paymentMode",
  "providerProfile",
  "binanceId",
  "binanceName",
  "qrImageUrl",
  "manualType",
  "manualConfig",
  "paymentInstructions",
];

export const resolveLiveGateway = async (gw) => {
  if (!gw || !gw.isPlatformConnected || !gw.platformGatewayRef) return gw;

  const platform = await PaymentGateway.findById(gw.platformGatewayRef).populate("providerProfile");
  if (!platform) return gw; // platform gateway was deleted — fall back to whatever's stored

  for (const field of LIVE_FIELDS) {
    gw[field] = platform[field];
  }

  return gw;
};

// Batched version for list endpoints — one query for all referenced
// platform gateways instead of N+1.
export const resolveLiveGateways = async (gateways) => {
  const refIds = [...new Set(
    gateways
      .filter((g) => g.isPlatformConnected && g.platformGatewayRef)
      .map((g) => String(g.platformGatewayRef))
  )];

  if (refIds.length === 0) return gateways;

  const platforms = await PaymentGateway.find({ _id: { $in: refIds } }).populate("providerProfile");
  const byId = new Map(platforms.map((p) => [String(p._id), p]));

  for (const gw of gateways) {
    if (!gw.isPlatformConnected || !gw.platformGatewayRef) continue;
    const platform = byId.get(String(gw.platformGatewayRef));
    if (!platform) continue;
    for (const field of LIVE_FIELDS) {
      gw[field] = platform[field];
    }
  }

  return gateways;
};
