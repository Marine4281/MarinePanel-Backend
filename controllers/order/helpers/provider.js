// controllers/order/helpers/provider.js
import ProviderProfile from "../../../models/ProviderProfile.js";

export const resolveProviderProfile = async ({ req, serviceData }) => {
  let providerProfile = await ProviderProfile.findById(
    serviceData.providerProfileId
  );

  // Fallback: providerProfileId is stale (e.g. after a re-sync or reseller
  // name override mutated the service doc). Try matching by provider name
  // against the main-platform profiles (cpOwner: null).
  if (!providerProfile && serviceData.provider && serviceData.provider !== "manual") {
    providerProfile = await ProviderProfile.findOne({
      name: serviceData.provider,
      cpOwner: null,
    });
  }

  if (!providerProfile) return null;

  let effectiveProviderProfile = providerProfile;
  let routeThroughMainPlatformApi = false;

  if (req.childPanel) {
    if (serviceData.cpOwner) {
      // CP's own service — use the CP's own provider profile directly.
      const cpProviderProfile = await ProviderProfile.findOne({
        _id: serviceData.providerProfileId,
        cpOwner: req.childPanel._id,
      });
      if (cpProviderProfile) effectiveProviderProfile = cpProviderProfile;
    } else {
      // Platform service used by a CP end-user.
      // Use the platform's own provider profile directly — do NOT call the
      // platform's HTTP API endpoint, that would create a duplicate order.
      effectiveProviderProfile = providerProfile;
      routeThroughMainPlatformApi = false;
    }
  }

  return { effectiveProviderProfile, routeThroughMainPlatformApi };
};
