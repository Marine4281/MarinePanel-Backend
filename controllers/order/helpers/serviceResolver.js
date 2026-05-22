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
    serviceData = await Service.findOne(serviceQuery);
  }

  return serviceData;
};
