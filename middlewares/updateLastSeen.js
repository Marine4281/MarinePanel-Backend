//middlewares/updateLastSeen.js
import User from "../models/User.js";

const LAST_SEEN_UPDATE_INTERVAL = 1000 * 60 * 2; // 2 minutes

const updateLastSeen = (req, res, next) => {
  try {
    if (!req.user) return next();

    const now = Date.now();
    const lastSeenTime = req.user.lastSeen
      ? new Date(req.user.lastSeen).getTime()
      : 0;

    // Only update if interval passed
    if (now - lastSeenTime > LAST_SEEN_UPDATE_INTERVAL) {
      // 🔥 Non-blocking DB write (no await)
      User.findByIdAndUpdate(
        req.user._id,
        { lastSeen: new Date() },
        { timestamps: false } // avoid touching updatedAt if enabled
      ).exec();
    }
  } catch (err) {
    console.error("updateLastSeen error:", err.message);
    // never break request flow
  }

  next();
};

export default updateLastSeen;
