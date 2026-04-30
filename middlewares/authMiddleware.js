// middlewares/authMiddleware.js
import jwt from "jsonwebtoken";
import User from "../models/User.js";

// Protect routes (AUTH ONLY — no side effects)
export const protect = async (req, res, next) => {
  let token;

  // 1️⃣ Check Authorization header
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  // 2️⃣ Fallback to cookie
  if (!token && req.cookies?.token) {
    token = req.cookies.token;
  }

  // 3️⃣ No token
  if (!token) {
    return res.status(401).json({ message: "Not authorized, no token" });
  }

  try {
    // 4️⃣ Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ["HS256"],
    });

    // 5️⃣ Fetch user — scope-aware
    // We look up by _id AND scope together so a token from
    // Child Panel A can never authenticate on Child Panel B
    // even if someone copies the token across panels.
    const scope = req.scope || "platform";

    const user = await User.findOne({
      _id: decoded.id,
      scope: scope,
    }).select("-password");

    if (!user) {
      return res
        .status(401)
        .json({ message: "Not authorized, user not found" });
    }

    // 6️⃣ Block check
    if (user.isBlocked) {
      return res.status(403).json({
        message: "Your account has been blocked. Contact support.",
      });
    }

    // 7️⃣ Child panel suspension check
    // If this user IS a child panel owner and their panel
    // has been suspended by admin, block all requests
    if (user.isChildPanel && !user.childPanelIsActive) {
      return res.status(403).json({
        message: "Your panel has been suspended. Contact support.",
      });
    }

    // 8️⃣ Attach user
    req.user = user;

    next();
  } catch (error) {
    console.error("Auth middleware error:", error.message);
    return res
      .status(401)
      .json({ message: "Not authorized, token failed" });
  }
};
