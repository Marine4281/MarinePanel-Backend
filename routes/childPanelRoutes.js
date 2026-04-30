// routes/childPanelRoutes.js

import express from "express";
import {
  getChildPanelActivationFee,
  activateChildPanel,
  getChildPanelDashboard,
  getChildPanelResellers,
  getChildPanelUsers,
  getChildPanelOrders,
  toggleChildPanelResellerStatus,
  updateChildPanelBranding,
  updateChildPanelDomain,
  updateChildPanelSettings,
} from "../controllers/childPanelController.js";

import { protect } from "../middlewares/authMiddleware.js";
import { childPanelOnly } from "../middlewares/adminMiddleware.js";

const router = express.Router();

/*
--------------------------------
Activation fee — public so the
page can show price before login
--------------------------------
*/
router.get("/activation-fee", getChildPanelActivationFee);

/*
--------------------------------
Activate child panel
--------------------------------
*/
router.post("/activate", protect, activateChildPanel);

/*
--------------------------------
Dashboard
--------------------------------
*/
router.get("/dashboard", protect, childPanelOnly, getChildPanelDashboard);

/*
--------------------------------
Resellers under this child panel
--------------------------------
*/
router.get("/resellers", protect, childPanelOnly, getChildPanelResellers);
router.put("/resellers/:id/toggle-status", protect, childPanelOnly, toggleChildPanelResellerStatus);
router.put("/resellers/:id/commission", protect, childPanelOnly, updateChildPanelResellerCommission);

/*
--------------------------------
Users under this child panel
--------------------------------
*/
router.get("/users", protect, childPanelOnly, getChildPanelUsers);

/*
--------------------------------
Orders under this child panel
--------------------------------
*/
router.get("/orders", protect, childPanelOnly, getChildPanelOrders);

/*
--------------------------------
Branding
--------------------------------
*/
router.put("/branding", protect, childPanelOnly, updateChildPanelBranding);

/*
--------------------------------
Domain
--------------------------------
*/
router.put("/domain", protect, childPanelOnly, updateChildPanelDomain);

/*
--------------------------------
Settings (fees, commission)
--------------------------------
*/
router.put("/settings", protect, childPanelOnly, updateChildPanelSettings);


export default router;
