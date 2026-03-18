// controllers/resellerServiceController.js
import Service from "../models/Service.js";
import User from "../models/User.js";
import ResellerService from "../models/ResellerService.js";
import Settings from "../models/Settings.js";

/* =========================================================
GET ALL SERVICES (Reseller/Admin/End User)
========================================================= */
export const getResellerServices = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Determine whose commission to use:
    // 1️⃣ Reseller admin → use their own
    // 2️⃣ End user of a reseller → use resellerOwner's commission
    // 3️⃣ Main panel user → no reseller commission (0)
    let resellerCommission = 0;
    let resellerId = null;

    if (user.isReseller) {
      resellerCommission = Number(user.resellerCommissionRate || 0);
      resellerId = user._id;
    } else if (user.resellerOwner) {
      const owner = await User.findById(user.resellerOwner);
      resellerCommission = Number(owner?.resellerCommissionRate || 0);
      resellerId = owner?._id || null;
    }

    // Admin/system commission
    const settings = await Settings.findOne();
    const adminCommission = Number(settings?.commission || 0);

    // Fetch active services
    const services = await Service.find({ status: true })
      .select("name rate min max category visible serviceId")
      .lean();

    // Fetch reseller-specific overrides
    let resellerOverrides = [];
    if (resellerId) {
      resellerOverrides = await ResellerService.find({
        resellerId,
      }).lean();
    }

    const overridesMap = {};
    resellerOverrides.forEach((r) => {
      overridesMap[r.serviceId.toString()] = r;
    });

    const formattedServices = services
      .map((s) => {
        const providerRate = Number(s.rate || 0);

        // System/admin adjusted price
        const systemRate = providerRate + (providerRate * adminCommission) / 100;

        // Reseller-adjusted price
        const finalRate = systemRate + (systemRate * resellerCommission) / 100;

        const override = overridesMap[s._id.toString()];
        const visible = override?.visible ?? s.visible ?? true;

        return {
          _id: s._id,
          serviceId: s.serviceId || s._id,
          name: s.name,
          category: s.category || "General",
          visible,

          // Pricing
          providerRate,
          systemRate,
          resellerRate: finalRate,
          finalRate,
          rate: finalRate, // fallback for UI

          min: Number(s.min ?? 1),
          max: Number(s.max ?? 100000),
        };
      })
      .filter((s) => s.visible);

    res.json({
      services: formattedServices,
      commission: resellerCommission,
    });
  } catch (error) {
    console.error("GET RESELLER SERVICES ERROR:", error);
    res.status(500).json({ message: "Failed to fetch services" });
  }
};

/* =========================================================
UPDATE SERVICE VISIBILITY (PER RESELLER)
========================================================= */
export const updateServiceVisibility = async (req, res) => {
  try {
    const { serviceId, visible } = req.body;
    const resellerId = req.user._id;

    if (!serviceId) return res.status(400).json({ message: "Service ID required" });

    const record = await ResellerService.findOneAndUpdate(
      { resellerId, serviceId },
      { visible },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({ message: "Visibility updated for reseller", record });
  } catch (error) {
    console.error("UPDATE RESELLER VISIBILITY ERROR:", error);
    res.status(500).json({ message: "Failed to update visibility" });
  }
};

/* =========================================================
UPDATE SERVICE NAME OR CATEGORY (GLOBAL)
========================================================= */
export const updateServiceName = async (req, res) => {
  try {
    const { serviceId, newName, newCategoryName } = req.body;

    if (!serviceId) return res.status(400).json({ message: "Service ID required" });

    const service = await Service.findById(serviceId);
    if (!service) return res.status(404).json({ message: "Service not found" });

    if (newName) service.name = newName;
    if (newCategoryName) service.category = newCategoryName;

    await service.save();

    res.json({ message: "Service updated", service });
  } catch (error) {
    console.error("UPDATE SERVICE ERROR:", error);
    res.status(500).json({ message: "Failed to update service" });
  }
};

/* =========================================================
SET RESELLER COMMISSION
========================================================= */
export const setResellerCommission = async (req, res) => {
  try {
    const commissionNumber = Number(req.body.commission);

    if (isNaN(commissionNumber))
      return res.status(400).json({ message: "Commission must be a number" });

    if (commissionNumber < 0)
      return res.status(400).json({ message: "Commission cannot be negative" });

    const reseller = await User.findById(req.user._id);
    if (!reseller) return res.status(404).json({ message: "Reseller not found" });

    reseller.resellerCommissionRate = commissionNumber;
    await reseller.save();

    res.json({ message: "Commission updated", commission: commissionNumber });
  } catch (error) {
    console.error("SET RESELLER COMMISSION ERROR:", error);
    res.status(500).json({ message: "Failed to set commission" });
  }
};
