import User from "../models/User.js";
import Order from "../models/Order.js";
import Settings from "../models/Settings.js";
import Wallet from "../models/Wallet.js";

/*
--------------------------------
Activate Reseller
--------------------------------
*/
export const activateReseller = async (req, res) => {
  try {
    const userId = req.user._id;
    const { brandName, domainType, customDomain } = req.body;

    if (!brandName) {
      return res.status(400).json({
        message: "Brand name required",
      });
    }

    const slug = brandName.toLowerCase().replace(/[^a-z0-9]/g, "");

    const existingBrand = await User.findOne({
      brandSlug: slug,
    });

    if (existingBrand) {
      return res.status(400).json({
        message: "Brand already taken",
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    if (user.isReseller) {
      return res.status(400).json({
        message: "Reseller already activated",
      });
    }

    /*
    --------------------------------
    Load Settings
    --------------------------------
    */
    const settings = await Settings.findOne();

    const activationFee = settings?.resellerActivationFee || 25;
    const platformDomain = settings?.platformDomain || "marinepanel.online";

    /*
    --------------------------------
    Get Wallet
    --------------------------------
    */
    const wallet = await Wallet.findOne({ user: user._id });

    if (!wallet) {
      return res.status(404).json({
        message: "Wallet not found",
      });
    }

    if (wallet.balance < activationFee) {
      return res.status(400).json({
        message: `You need $${activationFee} in your wallet to activate reseller`,
      });
    }

    let finalDomain = "";

    /*
    --------------------------------
    Subdomain Option
    --------------------------------
    */
    if (domainType === "subdomain") {
      finalDomain = `${slug}.${platformDomain}`;
    }

    /*
    --------------------------------
    Custom Domain Option
    --------------------------------
    */
    if (domainType === "custom") {
      if (!customDomain) {
        return res.status(400).json({
          message: "Custom domain required",
        });
      }

      const existingDomain = await User.findOne({
        resellerDomain: customDomain,
      });

      if (existingDomain) {
        return res.status(400).json({
          message: "Domain already in use",
        });
      }

      finalDomain = customDomain;
    }

    /*
    --------------------------------
    Activate Reseller
    --------------------------------
    */
    user.isReseller = true;
    user.brandName = brandName;
    user.brandSlug = slug;
    user.resellerDomain = finalDomain;
    user.resellerActivatedAt = new Date();

// Deduct Activation Fee & Log Transaction
    wallet.balance -= activationFee;
    wallet.transactions.push({
      type: "Withdrawal",              
      amount: -activationFee,      
      status: "Completed",        
      description: "Reseller panel activation fee",
      date: new Date(),
    });

    await wallet.save();
    await user.save();

    res.json({
      message: "Reseller activated successfully",
      domain: finalDomain,
      activationFee,
      remainingBalance: wallet.balance,
    });
  } catch (error) {
    console.error("Activate reseller error:", error);
    res.status(500).json({ message: "Failed to activate reseller" });
  }
};
/*
--------------------------------
Get Reseller Activation Fee
--------------------------------
*/
export const getActivationFee = async (req, res) => {
  try {
    const settings = await Settings.findOne();

    res.json({
      fee: settings?.resellerActivationFee || 25,
      platformDomain: settings?.platformDomain || "marinepanel.online",
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to fetch activation fee",
    });
  }
};

/*
--------------------------------
Reseller Dashboard
--------------------------------
*/
export const getResellerDashboard = async (req, res) => {
  try {
    const resellerId = req.user._id;

    const usersCount = await User.countDocuments({
      resellerOwner: resellerId,
    });

    const orders = await Order.find({
      resellerOwner: resellerId,
    });

    const ordersCount = orders.length;

    const revenue = orders.reduce(
      (sum, o) => sum + (o.resellerCommission || 0),
      0
    );

    const user = await User.findById(resellerId);

    const wallet = await Wallet.findOne({
      user: resellerId,
    });

    res.json({
      users: usersCount,
      orders: ordersCount,
      revenue,
      wallet: wallet?.balance || 0,
      domain: user.resellerDomain,
      brandName: user.brandName,
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to load dashboard",
    });
  }
};

/*
--------------------------------
Get Reseller Users
--------------------------------
*/
export const getResellerUsers = async (req, res) => {
  try {

    const users = await User.find({
      resellerOwner: req.user._id,
    })
      .select("-password")
      .sort({ createdAt: -1 });

    res.json(users);

  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to fetch reseller users",
    });
  }
};

/*
--------------------------------
Get Reseller Orders
--------------------------------
*/
export const getResellerOrders = async (req, res) => {
  try {

    const orders = await Order.find({
      resellerOwner: req.user._id,
    }).sort({ createdAt: -1 });

    res.json(orders);

  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to fetch reseller orders",
    });
  }
};

/*
--------------------------------
Withdraw Earnings
--------------------------------
*/
export const withdrawResellerFunds = async (req, res) => {
  try {
    const { amount } = req.body;
    const settings = await Settings.findOne();
    const minWithdraw = settings?.resellerWithdrawMin || 10;

    const user = await User.findById(req.user._id);
    const wallet = await Wallet.findOne({ user: user._id });

    if (amount < minWithdraw) return res.status(400).json({ message: `Minimum withdraw is $${minWithdraw}` });
    if (amount > (user.resellerWallet || 0)) return res.status(400).json({ message: "Insufficient balance" });

    // Deduct from resellerWallet
    user.resellerWallet -= amount;
    await user.save();

    // Log transaction in Wallet
    if (wallet) {
      wallet.transactions.push({
        type: "Withdrawal",
        amount: amount,
        status: "Completed",
        description: "Reseller funds withdrawal",
        date: new Date(),
      });
      wallet.balance -= amount;
      await wallet.save();
    }

    res.json({
      message: "Withdraw request submitted",
      remainingBalance: user.resellerWallet,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Withdraw failed" });
  }
};


/*
--------------------------------
Update Branding
--------------------------------
*/
export const updateBranding = async (req, res) => {
  try {

    const { logo, themeColor } = req.body;

    const user = await User.findById(req.user._id);

    if (!user.isReseller) {
      return res.status(403).json({
        message: "Not a reseller",
      });
    }

    if (logo !== undefined) user.logo = logo;
    if (themeColor !== undefined) user.themeColor = themeColor;

    await user.save();

    res.json({
      message: "Branding updated",
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to update branding",
    });
  }
};

//Branding
export const getBranding = async (req, res) => {
  try {

    if (!req.reseller) {
      return res.json({
        brandName: "MarinePanel",
        logo: null,
        themeColor: "#ff6b00"
      });
    }

    const reseller = req.reseller;

    res.json({
      brandName: reseller.brandName,
      logo: reseller.logo || null,
      themeColor: reseller.themeColor || "#ff6b00"
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to fetch branding" });
  }
};
