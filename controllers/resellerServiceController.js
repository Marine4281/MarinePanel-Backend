import Service from "../models/Service.js";
import User from "../models/User.js";
import ResellerService from "../models/ResellerService.js";


/*
--------------------------------
Get all services for reseller
--------------------------------
*/
export const getResellerServices = async (req, res) => {
  try {

    const reseller = await User.findById(req.user._id);

    const commission = Number(reseller?.resellerCommissionRate || 0);

    const services = await Service.find().lean();

    const formattedServices = services.map((s) => {

      // System rate (this already includes admin commission)
      const systemRate = Number(s.rate || s.price || 0);

      // Reseller price calculation
      const finalPrice = systemRate * (1 + commission / 100);

      return {

        _id: s._id,
        serviceId: s.serviceId || s._id,

        name: s.name,
        category: s.category || "General",

        visible: s.visible ?? true,

        // Pricing fields
        price: Number(s.price || 0),   // provider price
        rate: systemRate,              // system price users see
        finalPrice: finalPrice,        // reseller selling price

        min: Number(s.min ?? 1),
        max: Number(s.max ?? 100000)

      };

    });

    res.json({
      services: formattedServices,
      commission
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      message: "Failed to fetch services"
    });

  }
};



/*
--------------------------------
Update service visibility
--------------------------------
*/
export const updateServiceVisibility = async (req, res) => {

  try {

    const { serviceId, visible } = req.body;

    const service = await Service.findById(serviceId);

    if (!service) {
      return res.status(404).json({
        message: "Service not found"
      });
    }

    service.visible = visible;

    await service.save();

    res.json({
      message: "Service visibility updated"
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      message: "Failed to update service visibility"
    });

  }

};



/*
--------------------------------
Update service name or category
--------------------------------
*/
export const updateServiceName = async (req, res) => {

  try {

    const { serviceId, newName, newCategoryName } = req.body;

    if (!serviceId) {
      return res.status(400).json({
        message: "Service ID required"
      });
    }

    const service = await Service.findById(serviceId);

    if (!service) {
      return res.status(404).json({
        message: "Service not found"
      });
    }

    if (newName) {
      service.name = newName;
    }

    if (newCategoryName) {
      service.category = newCategoryName;
    }

    await service.save();

    res.json({
      message: "Service updated",
      service
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      message: "Failed to update service"
    });

  }

};



/*
--------------------------------
Set reseller commission
--------------------------------
*/
export const setResellerCommission = async (req, res) => {

  try {

    const { commission } = req.body;

    const commissionNumber = Number(commission);

    if (commissionNumber < 0) {
      return res.status(400).json({
        message: "Commission cannot be negative"
      });
    }

    const reseller = await User.findById(req.user._id);

    if (!reseller) {
      return res.status(404).json({
        message: "Reseller not found"
      });
    }

    reseller.resellerCommissionRate = commissionNumber;

    await reseller.save();

    res.json({
      message: "Commission updated",
      commission: commissionNumber
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      message: "Failed to set commission"
    });

  }

};

export const updateServiceVisibility = async (req, res) => {
  try {

    const { serviceId, visible } = req.body;

    const resellerId = req.user._id;

    const record = await ResellerService.findOneAndUpdate(
      { resellerId, serviceId },
      { visible },
      { upsert: true, new: true }
    );

    res.json({
      message: "Visibility updated",
      record
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      message: "Failed to update visibility"
    });

  }
};
