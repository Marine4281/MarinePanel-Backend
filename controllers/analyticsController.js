// controllers/gscController.js
//
// Admin-only Google Search Console reporting endpoints, backed by
// the Google Search Console API (see utils/gscClient.js).

const { getGscClient, getPropertyUrl } = require("../utils/gscClient");

// Helper to map range query params to start dates
function resolveStartDate(range) {
  const days = range === "7d" ? 7 : range === "90d" ? 90 : 30;
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().split("T")[0]; // YYYY-MM-DD
}

function getTodayDate() {
  return new Date().toISOString().split("T")[0]; // YYYY-MM-DD
}

// GET /api/admin/gsc/overview?range=7d|30d|90d
exports.getOverview = async (req, res) => {
  try {
    const client = await getGscClient();
    const siteUrl = getPropertyUrl();
    const startDate = resolveStartDate(req.query.range);
    const endDate = getTodayDate();

    const requestURL = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;

    const response = await client.request({
      url: requestURL,
      method: "POST",
      data: {
        startDate,
        endDate,
        // No dimensions requested aggregates total site metrics
      },
    });

    const row = response.data.rows?.[0] || { clicks: 0, impressions: 0, ctr: 0, position: 0 };

    res.json({
      clicks: row.clicks || 0,
      impressions: row.impressions || 0,
      ctr: row.ctr || 0,
      position: row.position || 0,
    });
  } catch (error) {
    console.error("getOverview error:", error.message);
    res.status(500).json({ message: error.message || "Failed to fetch GSC overview" });
  }
};

// GET /api/admin/gsc/timeseries?range=7d|30d|90d
exports.getTimeseries = async (req, res) => {
  try {
    const client = await getGscClient();
    const siteUrl = getPropertyUrl();
    const startDate = resolveStartDate(req.query.range);
    const endDate = getTodayDate();

    const requestURL = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;

    const response = await client.request({
      url: requestURL,
      method: "POST",
      data: {
        startDate,
        endDate,
        dimensions: ["date"],
      },
    });

    const rows = (response.data.rows || []).map((r) => ({
      date: r.keys[0], // YYYY-MM-DD
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: r.ctr,
      position: r.position,
    }));

    res.json(rows);
  } catch (error) {
    console.error("getTimeseries error:", error.message);
    res.status(500).json({ message: error.message || "Failed to fetch GSC timeseries" });
  }
};

// GET /api/admin/gsc/top-queries?range=7d|30d|90d&limit=10
exports.getTopQueries = async (req, res) => {
  try {
    const client = await getGscClient();
    const siteUrl = getPropertyUrl();
    const startDate = resolveStartDate(req.query.range);
    const endDate = getTodayDate();
    const rowLimit = Number(req.query.limit) || 10;

    const requestURL = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;

    const response = await client.request({
      url: requestURL,
      method: "POST",
      data: {
        startDate,
        endDate,
        dimensions: ["query"],
        rowLimit,
      },
    });

    const rows = (response.data.rows || []).map((r) => ({
      query: r.keys[0],
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: r.ctr,
      position: r.position,
    }));

    res.json(rows);
  } catch (error) {
    console.error("getTopQueries error:", error.message);
    res.status(500).json({ message: error.message || "Failed to fetch top queries" });
  }
};

// GET /api/admin/gsc/top-pages?range=7d|30d|90d&limit=10
exports.getTopPages = async (req, res) => {
  try {
    const client = await getGscClient();
    const siteUrl = getPropertyUrl();
    const startDate = resolveStartDate(req.query.range);
    const endDate = getTodayDate();
    const rowLimit = Number(req.query.limit) || 10;

    const requestURL = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;

    const response = await client.request({
      url: requestURL,
      method: "POST",
      data: {
        startDate,
        endDate,
        dimensions: ["page"],
        rowLimit,
      },
    });

    const rows = (response.data.rows || []).map((r) => ({
      path: r.keys[0],
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: r.ctr,
      position: r.position,
    }));

    res.json(rows);
  } catch (error) {
    console.error("getTopPages error:", error.message);
    res.status(500).json({ message: error.message || "Failed to fetch top pages" });
  }
};
