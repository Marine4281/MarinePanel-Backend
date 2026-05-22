// controllers/order/helpers/childPanel.js
import User from "../../../models/User.js";

export const resolveChildPanelData = async (user) => {
  let childPanelOwnerId = null;
  let childPanelPerOrderFee = 0;

  if (user.childPanelOwner) {
    const cpOwner = await User.findById(user.childPanelOwner);

    if (cpOwner && cpOwner.isChildPanel && cpOwner.childPanelIsActive) {
      childPanelOwnerId = cpOwner._id;
      childPanelPerOrderFee = Number(cpOwner.childPanelPerOrderFee || 0);
    }
  }

  return { childPanelOwnerId, childPanelPerOrderFee };
};
