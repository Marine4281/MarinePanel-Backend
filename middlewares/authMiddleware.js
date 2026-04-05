import jwt from "jsonwebtoken";
import User from "../models/User.js";

// ⏱ how often to update lastSeen (avoid DB overload)
const LAST_SEEN_UPDATE_INTERVAL = 1000 * 60 * 2; // 2 minutes

// Protect routes
export const protect = async (req, res, next) => {
  let token;

  // 1️⃣ Check Authorization header first
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  // 2️⃣ If no header token, check cookie
  if (!token && req.cookies?.token) {
    token = req.cookies.token;
  }

  // 3️⃣ If still no token, reject
  if (!token) {
    return res.status(401).json({ message: "Not authorized, no token" });
  }

  try {
    // 4️⃣ Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 5️⃣ Fetch user
    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      return res
        .status(401)
        .json({ message: "Not authorized, user not found" });
    }

    // 6️⃣ Check if blocked
    if (user.isBlocked) {
      return res.status(403).json({
        message: "Your account has been blocked. Contact support.",
      });
    }

    // ✅ 7️⃣ UPDATE LAST SEEN (optimized)
    const now = Date.now();
    const lastSeenTime = user.lastSeen
      ? new Date(user.lastSeen).getTime()
      : 0;

    if (now - lastSeenTime > LAST_SEEN_UPDATE_INTERVAL) {
      user.lastSeen = new Date();
      await user.save(); // safe, minimal writes
    }

    // 8️⃣ Attach user to request
    req.user = user;

    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    return res
      .status(401)
      .json({ message: "Not authorized, token failed" });
  }
};
