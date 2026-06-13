// controllers/order/helpers/provider.js
import ProviderProfile from "../../../models/ProviderProfile.js";

export const resolveProviderProfile = async ({ req, serviceData }) => {
  let providerProfile = await ProviderProfile.findById(
    serviceData.providerProfileId
  );

  // Fallback: stale providerProfileId — try matching by provider name
  // against main-platform profiles (cpOwner: null).
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
  //
  // Case (b) must be treated as a normal user order — no CP routing at all.
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
    } else {
      // Platform service used by a CP end-user.
      // Call the provider directly — do NOT call the platform's HTTP API.
      effectiveProviderProfile = providerProfile;
      routeThroughMainPlatformApi = false;
    }
  }

  return { effectiveProviderProfile, routeThroughMainPlatformApi };
};
