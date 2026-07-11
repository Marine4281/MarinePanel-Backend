// middleware/scopeMiddleware.js
//
// Runs after both detectResellerDomain and detectChildPanelDomain.
// Determines which scope the current request belongs to and
// attaches req.scope to every request.
//
// req.scope is used in all auth lookups (register, login,
// forgot password) so users are fully isolated between panels.
//
// 'platform'        = main marinepanel.online (direct signups only)
// <childPanel._id>  = a child panel domain
// <reseller._id>    = a reseller's own subdomain/custom domain
//
// Each reseller is now its OWN isolation boundary — same email can
// register as a completely separate account on Reseller A's domain,
// Reseller B's domain, and the main platform. No cross-panel lookup
// ever happens, same guarantee that already existed for child panels.
//
// Note: detectChildPanelDomain already skips setting req.childPanel
// whenever req.reseller is present, so these two branches never both
// fire for the same request — a reseller's own domain is always the
// most specific scope, even if that reseller belongs to a child panel.

export const attachScope = (req, res, next) => {
  try {
    if (req.reseller) {
      // Request is coming from a reseller's own domain/subdomain.
      req.scope = req.reseller._id.toString();
    } else if (req.childPanel) {
      // Request is coming from a child panel domain
      req.scope = req.childPanel._id.toString();
    } else {
      // Main platform — direct marinepanel.online signups only
      req.scope = "platform";
    }

    next();
  } catch (error) {
    console.error("Scope middleware error:", error);
    next();
  }
};
