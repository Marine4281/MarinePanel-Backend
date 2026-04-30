// middleware/scopeMiddleware.js
//
// Runs after both detectResellerDomain and detectChildPanelDomain.
// Determines which scope the current request belongs to and
// attaches req.scope to every request.
//
// req.scope is used in all auth lookups (register, login,
// forgot password) so users are fully isolated between panels.
//
// 'platform'       = main marinepanel.online
// <childPanel._id> = a child panel domain
//
// Reseller users still belong to 'platform' scope or the child
// panel scope — they are NOT their own scope. The reseller owner
// is tracked via resellerOwner field on the User, not via scope.

export const attachScope = (req, res, next) => {
  try {
    if (req.childPanel) {
      // Request is coming from a child panel domain
      req.scope = req.childPanel._id.toString();
    } else {
      // Main platform — covers marinepanel.online and all
      // reseller subdomains/custom domains under the platform
      req.scope = "platform";
    }

    next();
  } catch (error) {
    console.error("Scope middleware error:", error);
    next();
  }
};
