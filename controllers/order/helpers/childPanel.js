// controllers/order/helpers/childPanel.js
import User from "../../../models/User.js";

export const resolveChildPanelData = async (user) => {
  let childPanelOwnerId = null;
  let childPanelPerOrderFee = 0;

  // CP owners themselves are not end-users of any child panel.
  // Only look up childPanelOwner for non-CP-owner users.
  if (user.childPanelOwner && !user.isChildPanel) {
    const cpOwner = await User.findById(user.childPanelOwner);

    if (cpOwner && cpOwner.isChildPanel && cpOwner.childPanelIsActive) {
      childPanelOwnerId = cpOwner._id;
      childPanelPerOrderFee = Number(cpOwner.childPanelPerOrderFee || 0);
    }
  }

  // ─── NEW: Reseller → CP chain ────────────────────────────────────────
  // If this user belongs to a reseller who belongs to a child panel,
  // that child panel should own this order too.
  if (!childPanelOwnerId && user.resellerOwner) {
    const reseller = await User.findById(user.resellerOwner).select(
      "childPanelOwner isChildPanel childPanelIsActive childPanelPerOrderFee"
    );

    if (reseller && reseller.childPanelOwner) {
      const cpOwner = await User.findById(reseller.childPanelOwner).select(
        "isChildPanel childPanelIsActive childPanelPerOrderFee"
      );

      if (cpOwner && cpOwner.isChildPanel && cpOwner.childPanelIsActive) {
        childPanelOwnerId = cpOwner._id;
        childPanelPerOrderFee = Number(cpOwner.childPanelPerOrderFee || 0);
      }
    }
  }

  return { childPanelOwnerId, childPanelPerOrderFee };
};
