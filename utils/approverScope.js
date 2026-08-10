// utils/approverScope.js
//
// Who reviews a Pending deposit/withdrawal: platform admin or the CP
// owner? Resolved from the gateway used, not from any user-level
// setting — a single CP can mix their own gateways with platform-
// connected ones, so this has to be decided per-transaction.

export const resolveApproverScope = (childPanelOwner, gw) => {
  if (!childPanelOwner) return "admin";           // direct platform user
  if (gw?.isPlatformConnected) return "admin";     // platform funds exposed
  return "cp";                                     // CP's own gateway
};
