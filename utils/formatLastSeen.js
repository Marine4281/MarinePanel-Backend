//utils/formatLastSeen.js
export const formatLastSeen = (lastSeen) => {
  if (!lastSeen) return "Offline";

  const now = new Date();
  const last = new Date(lastSeen);

  const diffMs = now - last;
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  // ✅ ONLINE (within 2 minutes)
  if (diffMinutes < 2) return "Online";

  // ✅ Minutes ago
  if (diffMinutes < 60) {
    return `Last seen ${diffMinutes} min${diffMinutes > 1 ? "s" : ""} ago`;
  }

  // ✅ Today
  const isToday =
    now.toDateString() === last.toDateString();

  if (isToday) {
    return `Last seen today ${last.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  }

  // ✅ Yesterday
  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);

  if (yesterday.toDateString() === last.toDateString()) {
    return `Last seen yesterday ${last.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  }

  // ✅ Days ago
  if (diffDays < 7) {
    return `Last seen ${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
  }

  // ✅ Weeks ago
  if (diffDays < 14) {
    return `Last seen 1 week ago`;
  }

  // ✅ Full date
  return `Last seen ${last.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  })}`;
};
export default formatLastSeen;
