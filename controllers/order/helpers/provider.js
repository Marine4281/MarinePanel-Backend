// controllers/order/helpers/provider.js
import ProviderProfile from "../../../models/ProviderProfile.js";
import Service from "../../../models/Service.js";

export const resolveProviderProfile = async ({ req, serviceData }) => {

  // ─── CASE: CP-imported platform service ───────────────────────────────
  // These have provider: "platform" and providerServiceId = source Service._id.
  // We must route through the platform's own API using the source service's
  // numeric serviceId, with the platform's API key.
  if (serviceData.provider === "platform") {
    // Look up the original platform service to get its numeric serviceId
    const sourceService = await Service.findById(serviceData.providerServiceId).lean();

    if (!sourceService) {
      return null;
    }

    // Get the platform's provider profile (the real upstream provider)
    const providerProfile = await ProviderProfile.findById(
      sourceService.providerProfileId
    );

    if (!providerProfile) return null;

    // Override providerServiceId on serviceData so the caller sends the
    // correct upstream ID to the provider, not our internal MongoDB _id.
    serviceData.providerServiceId = sourceService.providerServiceId;
    serviceData.providerProfileId = sourceService.providerProfileId;

    return {
      effectiveProviderProfile: providerProfile,
      routeThroughMainPlatformApi: false,
    };
  }

  // ─── STANDARD FLOW ────────────────────────────────────────────────────
  let providerProfile = await ProviderProfile.findById(
    serviceData.providerProfileId
  );

  // Fallback: stale providerProfileId — try matching by provider name
  if (!providerProfile && serviceData.provider && serviceData.provider !== "manual") {
    providerProfile = await ProviderProfile.findOne({
      name: serviceData.provider,
      cpOwner: null,
    });
  }

  if (!providerProfile) return null;

  let effectiveProviderProfile = providerProfile;
  let routeThroughMainPlatformApi = false;

  // req.childPanel is set in two cases:
  //   a) An end-user on a CP domain  (req.childPanel !== req.user)
  //   b) The CP owner managing their panel via cpOwnerOnly (req.childPanel === req.user)
  // Only apply CP-specific logic for case (a).
  const isEndUserOnCpDomain =
    req.childPanel &&
    req.user &&
    req.childPanel._id.toString() !== req.user._id.toString();

  if (isEndUserOnCpDomain) {
    if (serviceData.cpOwner) {
      // CP's own service — use the CP's own provider profile directly.
      const cpProviderProfile = await ProviderProfile.findOne({
        _id: serviceData.providerProfileId,
        cpOwner: req.childPanel._id,
      });
      if (cpProviderProfile) effectiveProviderProfile = cpProviderProfile;
    }
    // Platform service used by CP end-user: effectiveProviderProfile already
    // points to the real upstream provider — nothing extra needed.
  }

  return { effectiveProviderProfile, routeThroughMainPlatformApi };
};
