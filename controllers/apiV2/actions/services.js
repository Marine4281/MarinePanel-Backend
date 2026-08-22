import Service from "../../../models/Service.js";
import User from "../../../models/User.js";
import Settings from "../../../models/Settings.js";

export const handleServices = async (req, res, user) => {
  // ── Which catalog does this API key see? ──────────────────────────
  // A CP's "catalog" is just Service docs with cpOwner = that CP's id —
  // whether those came from the CP's own provider or were imported from
  // the platform catalog via importCPPlatformServices, they land in the
  // same place. childPanelServiceMode only controls what the CP owner's
  // dashboard UI offers them (connect own provider / browse platform
  // services to import) — it is not a live filter over the admin
  // catalog, so it plays no part in what gets served here.
  let services = [];

  if (user.isChildPanel) {
    services = await Service.find({ status: true, cpOwner: user._id });
  } else if (user.childPanelOwner) {
    services = await Service.find({ status: true, cpOwner: user.childPanelOwner });
  } else {
    services = await Service.find({ status: true, cpOwner: null });
  }
  const settings = await Settings.findOne().lean();
  const adminRate = Number(settings?.commission || 0);

  // Resolve the CP commission rate that applies to this key, if any —
  // used only for pricing services that belong to that CP.
  let cpCommissionRate = 0;
  if (user.isChildPanel) {
    cpCommissionRate = Number(user.childPanelCommissionRate || 0);
  } else if (user.childPanelOwner) {
    const cpOwner = await User.findById(user.childPanelOwner);
    cpCommissionRate = Number(cpOwner?.childPanelCommissionRate || 0);
  }

  let resellerRate = 0;
  if (user.resellerOwner) {
    const reseller = await User.findById(user.resellerOwner);
    resellerRate = Number(reseller?.resellerCommissionRate || 0);
  }

  return res.json(
    services.map((s) => {
      const providerRate = Number(s.rate || 0);

      let baseRate;
      if (s.cpOwner) {
        // CP-owned service — no admin/platform commission layer.
        // The CP owner's own key pays cost (no downstream party to mark
        // up for); a reseller/end-user under the CP pays cost + the CP's
        // own commission.
        baseRate = user.isChildPanel
          ? providerRate
          : providerRate + (providerRate * cpCommissionRate) / 100;
      } else {
        // Main platform service — admin's commission, then the CP's own
        // commission layered on top when fetched through a CP context.
        const adminFinalRate = providerRate + (providerRate * adminRate) / 100;
        baseRate =
          user.childPanelOwner && !user.isChildPanel
            ? adminFinalRate + (adminFinalRate * cpCommissionRate) / 100
            : adminFinalRate;
      }

      const finalRate =
        resellerRate > 0 ? baseRate + (baseRate * resellerRate) / 100 : baseRate;

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
