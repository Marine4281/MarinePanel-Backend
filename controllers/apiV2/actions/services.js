import Service from "../../../models/Service.js";
import User from "../../../models/User.js";
import Settings from "../../../models/Settings.js";

export const handleServices = async (req, res, user) => {
  let serviceQuery = { status: true, cpOwner: null };
  if (user.childPanelOwner && !user.isChildPanel) {
    serviceQuery = {
      status: true,
      $or: [
        { cpOwner: user.childPanelOwner },
        { cpOwner: null, availableToChildPanels: true },
      ],
    };
  }
  const services = await Service.find(serviceQuery);
  const settings = await Settings.findOne().lean();
  const adminRate = Number(settings?.commission || 0);

  let resellerRate = 0;
  if (user.resellerOwner) {
    const reseller = await User.findById(user.resellerOwner);
    resellerRate = Number(reseller?.resellerCommissionRate || 0);
  }

  return res.json(
    services.map((s) => {
      const providerRate = Number(s.rate || 0);
      const systemRate = providerRate + (providerRate * adminRate) / 100;
      const finalRate =
        resellerRate > 0
          ? systemRate + (systemRate * resellerRate) / 100
          : systemRate;

      return {
        service: s.serviceId,
        name: s.name,
        type: "Default",
        category: `${s.platform} - ${s.category}`,
        rate: Number(finalRate.toFixed(4)),
        min: s.min,
        max: s.max,
        refill: s.refillAllowed,
        cancel: s.cancelAllowed,
        description: s.description || "",
      };
    })
  );
};
