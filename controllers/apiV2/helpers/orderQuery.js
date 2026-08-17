/* =========================================================
   ORDER QUERY HELPERS
   CP end-users' orders are stored under userId = cpOwner.
   So we match on BOTH userId and endUserId.
========================================================= */
export const buildOrderQuery = (userId, rawId) => {
  const str = rawId?.toString().trim();
  const num = !isNaN(str) && str !== "" ? Number(str) : null;

  const idMatch = {
    $or: [
      ...(num !== null ? [{ customOrderId: num }] : []),
      { orderId: str },
    ],
  };

  return {
    $and: [
      { $or: [{ userId }, { endUserId: userId }] },
      idMatch,
    ],
  };
};

export const buildMultiOrderQuery = (userId, rawIds) => {
  const numericIds = rawIds.filter((id) => !isNaN(id) && id !== "").map(Number);
  const stringIds = rawIds;

  const idMatch = {
    $or: [
      ...(numericIds.length ? [{ customOrderId: { $in: numericIds } }] : []),
      { orderId: { $in: stringIds } },
    ],
  };

  return {
    $and: [
      { $or: [{ userId }, { endUserId: userId }] },
      idMatch,
    ],
  };
};
