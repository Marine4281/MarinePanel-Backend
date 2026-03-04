// Simple in-memory cache (upgradeable to Redis later)

const cacheStore = new Map();

export const setCache = (key, value, ttlSeconds = 300) => {
  const expiresAt = Date.now() + ttlSeconds * 1000;

  cacheStore.set(key, {
    value,
    expiresAt,
  });
};

export const getCache = (key) => {
  const data = cacheStore.get(key);

  if (!data) return null;

  if (Date.now() > data.expiresAt) {
    cacheStore.delete(key);
    return null;
  }

  return data.value;
};

export const clearCache = (key) => {
  cacheStore.delete(key);
};
