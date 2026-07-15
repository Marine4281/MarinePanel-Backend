import Service from "../../../models/Service.js";

export const resolveService = async ({ service, req }) => {
  const serviceQuery = {
    name: service,
    status: true,
  };

  let serviceData = null;

  if (req.childPanel) {
    serviceData = await Service.findOne({
      ...serviceQuery,
      cpOwner: req.childPanel._id,
    });

    if (!serviceData) {
      serviceData = await Service.findOne({
        ...serviceQuery,
        cpOwner: null,
        availableToChildPanels: true,
      });
    }
  } else if (!req.reseller) {
    // cpOwner has default: null in the schema, so $exists: false never matches.
    // Must query for null explicitly.
    serviceData = await Service.findOne({
      ...serviceQuery,
      cpOwner: null,
    });
  } else {
    // Reseller domain — resellers can only order platform (cpOwner: null) services.
    // If this reseller sits under a CP owner, prefer that CP owner's own
    // catalog first (mirrors the childPanel resolution above), then fall
    // back to platform services made available to child panels.
    if (req.reseller.childPanelOwner) {
      serviceData = await Service.findOne({
        ...serviceQuery,
        cpOwner: req.reseller.childPanelOwner,
      });

      if (!serviceData) {
        serviceData = await Service.findOne({
          ...serviceQuery,
          cpOwner: null,
          availableToChildPanels: true,
        });
      }
    } else {
      serviceData = await Service.findOne({
        ...serviceQuery,
        cpOwner: null,
      });
    }
  }

  return serviceData;
};
