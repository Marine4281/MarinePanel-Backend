import User from "../../../models/User.js";

export const resolveChildPanelData = async (user) => {
  let childPanelOwnerId = null;
  let childPanelCommission = 0;
  let childPanelPerOrderFee = 0;

  if (user.childPanelOwner) {
    const cpOwner = await User.findById(user.childPanelOwner);

    if (cpOwner && cpOwner.isChildPanel && cpOwner.childPanelIsActive) {
      childPanelOwnerId = cpOwner._id;

      childPanelPerOrderFee = Number(
        cpOwner.childPanelPerOrderFee || 0
      );

      childPanelCommission = Number(
        cpOwner.childPanelCommissionRate || 0
      );
    }
  }

  return {
    childPanelOwnerId,
    childPanelCommission,
    childPanelPerOrderFee,
  };
};
