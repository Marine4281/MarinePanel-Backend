import Service from "../../../models/Service.js";
import User from "../../../models/User.js";
import Settings from "../../../models/Settings.js";

export const handleServices = async (req, res, user) => {
  // ── Which catalog does this API key see? ──────────────────────────
  // - CP owner's own key  -> only their own catalog
  // - Reseller/end-user under a CP -> gated by that CP's
  //   childPanelServiceMode, same as getResellerServices:
  //     "platform" -> admin services opted in for child panels only
  //     "own"      -> the CP's own catalog only
  //     "both"     -> both, deduped
  //     "none"     -> nothing
  // - Everyone else (main platform) -> admin catalog only
  let services = [];

  if (user.isChildPanel) {
    services = await Service.find({ status: true, cpOwner: user._id });
  } else if (user.childPanelOwner) {
    const cpOwnerDoc = await User.findById(user.childPanelOwner)
      .select("childPanelServiceMode")
      .lean();
    const serviceMode = cpOwnerDoc?.childPanelServiceMode || "none";

    if (serviceMode === "none") {
      return res.json([]);
    }

    if (serviceMode === "platform" || serviceMode === "both") {
      const platformServices = await Service.find({
        status: true,
        cpOwner: null,
        availableToChildPanels: true,
      });
      services.push(...platformServices);
    }

    if (serviceMode === "own" || serviceMode === "both") {
      const ownServices = await Service.find({
        status: true,
        cpOwner: user.childPanelOwner,
      });
      services.push(...ownServices);
    }

    // Deduplicate by _id (mirrors getResellerServices)
    const seen = new Set();
    services = services.filter((s) => {
      const key = s._id.toString();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
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
