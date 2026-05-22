import User from "../../models/User.js";

import { resolveService } from "./helpers/serviceResolver.js";
import { calculateOrderPricing } from "./helpers/pricing.js";

export const previewOrder = async (req, res) => {
  try {
    const { service, quantity } = req.body;

    if (!service || !quantity) {
      return res.status(400).json({
        message: "Missing fields",
      });
    }

    const qty = Number(quantity);

    const serviceData = await resolveService({
      service,
      req,
    });

    if (!serviceData) {
      return res.status(404).json({
        message: "Service not found",
      });
    }

    if (serviceData.isFree) {
      return res.json({
        finalCharge: 0,
        baseCharge: 0,
        isFree: true,
      });
    }

    const user = await User.findById(req.user._id);

    const pricing = await calculateOrderPricing({
      serviceData,
      qty,
      user,
      childPanelOwnerId: user?.childPanelOwner,
    });

    res.json({
      baseCharge: pricing.baseCharge,
      finalCharge: pricing.finalCharge,
      finalRate: pricing.finalRate,
      isFree: false,
    });
  } catch (error) {
    console.error("Preview error:", error);

    res.status(500).json({
      message: "Preview failed",
    });
  }
};
