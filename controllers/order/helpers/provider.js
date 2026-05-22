import ProviderProfile from "../../models/ProviderProfile.js";

export const resolveProviderProfile = async ({
  req,
  serviceData,
}) => {
  const providerProfile = await ProviderProfile.findById(
    serviceData.providerProfileId
  );

  if (!providerProfile) {
    throw new Error("Provider profile not found");
  }

  let effectiveProviderProfile = providerProfile;
  let routeThroughMainPlatformApi = false;

  if (req.childPanel) {
    if (serviceData.cpOwner) {
      const cpProviderProfile = await ProviderProfile.findOne({
        _id: serviceData.providerProfileId,
        cpOwner: req.childPanel._id,
      });

      if (cpProviderProfile) {
        effectiveProviderProfile = cpProviderProfile;
      }
    } else {
      const cpPlatformProfile = await ProviderProfile.findOne({
        cpOwner: req.childPanel._id,
      }).sort({ createdAt: 1 });

      if (cpPlatformProfile) {
        effectiveProviderProfile = cpPlatformProfile;
        routeThroughMainPlatformApi = true;
      }
    }
  }

  return {
    effectiveProviderProfile,
    routeThroughMainPlatformApi,
  };
};
