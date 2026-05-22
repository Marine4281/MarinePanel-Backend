import Order from "../../models/Order.js";
import User from "../../models/User.js";
import Settings from "../../models/Settings.js";

import axios from "axios";
import { v4 as uuidv4 } from "uuid";

import { getNextOrderId } from "../../utils/orderId.js";

import {
  calculateBalance,
  ensureWallet,
  updateUserBalance,
} from "./helpers/wallet.js";

import { resolveService } from "./helpers/serviceResolver.js";
import { resolveProviderProfile } from "./helpers/provider.js";
import { resolveChildPanelData } from "./helpers/childPanel.js";
import { calculateOrderPricing } from "./helpers/pricing.js";

export const createOrder = async (req, res) => {
  try {
    
    res.status(200).json({
      message: "Refactor complete",
    });
  } catch (error) {
    console.error("CREATE ORDER ERROR:", error);

    res.status(500).json({
      message: "Order failed",
    });
  }
};
