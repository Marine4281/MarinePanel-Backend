// controllers/analyticsController.js
//
// Admin-only GA4 reporting endpoints, backed by the Google
// Analytics Data API (see utils/googleAnalyticsClient.js).

import { getAnalyticsClient, getPropertyId } from "../utils/googleAnalyticsClient.js";

const RANGE_MAP = {
  "7d": "7daysAgo",
  "30d": "30daysAgo",
  "90d": "90daysAgo",
};

function resolveRange(range) {
  return RANGE_MAP[range] || RANGE_MAP["30d"];
}

// GET /api/admin/analytics/overview?range=7d|30d|90d
export const getOverview = async (req, res) => {
  try {
    const client = getAnalyticsClient();
    const property = getPropertyId();
    const startDate = resolveRange(req.query.range);

    const [response] = await client.runReport({
      property,
      dateRanges: [{ startDate, endDate: "today" }],
      metrics: [
        { name: "activeUsers" },
        { name: "newUsers" },
        { name: "sessions" },
        { name: "screenPageViews" },
        { name: "bounceRate" },
        { name: "averageSessionDuration" },
      ],
    });

    const row = response.rows?.[0];
    const values = row?.metricValues?.map((m) => Number(m.value)) || [0, 0, 0, 0, 0, 0];

    res.json({
      activeUsers: values[0] || 0,
      newUsers: values[1] || 0,
      sessions: values[2] || 0,
      pageViews: values[3] || 0,
      bounceRate: values[4] || 0,
      avgSessionDuration: values[5] || 0,
    });
  } catch (error) {
    console.error("getOverview error:", error.message);
    res.status(500).json({ message: error.message || "Failed to fetch analytics overview" });
  }
};

// GET /api/admin/analytics/timeseries?range=7d|30d|90d
export const getTimeseries = async (req, res) => {
  try {
    const client = getAnalyticsClient();
    const property = getPropertyId();
    const startDate = resolveRange(req.query.range);

    const [response] = await client.runReport({
      property,
      dateRanges: [{ startDate, endDate: "today" }],
      dimensions: [{ name: "date" }],
      metrics: [{ name: "activeUsers" }, { name: "sessions" }, { name: "screenPageViews" }],
      orderBys: [{ dimension: { dimensionName: "date" } }],
    });

    const rows = (response.rows || []).map((r) => ({
      date: r.dimensionValues[0].value, // YYYYMMDD
      users: Number(r.metricValues[0].value),
      sessions: Number(r.metricValues[1].value),
      pageViews: Number(r.metricValues[2].value),
    }));

    res.json(rows);
  } catch (error) {
    console.error("getTimeseries error:", error.message);
    res.status(500).json({ message: error.message || "Failed to fetch analytics timeseries" });
  }
};

// GET /api/admin/analytics/top-pages?range=7d|30d|90d&limit=10
export const getTopPages = async (req, res) => {
  try {
    const client = getAnalyticsClient();
    const property = getPropertyId();
    const startDate = resolveRange(req.query.range);
    const limit = Number(req.query.limit) || 10;

    const [response] = await client.runReport({
      property,
      dateRanges: [{ startDate, endDate: "today" }],
      dimensions: [{ name: "pagePath" }],
      metrics: [{ name: "screenPageViews" }, { name: "activeUsers" }],
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
      limit,
    });

    const rows = (response.rows || []).map((r) => ({
      path: r.dimensionValues[0].value,
      pageViews: Number(r.metricValues[0].value),
      users: Number(r.metricValues[1].value),
    }));

    res.json(rows);
  } catch (error) {
    console.error("getTopPages error:", error.message);
    res.status(500).json({ message: error.message || "Failed to fetch top pages" });
  }
};

// GET /api/admin/analytics/traffic-sources?range=7d|30d|90d
export const getTrafficSources = async (req, res) => {
  try {
    const client = getAnalyticsClient();
    const property = getPropertyId();
    const startDate = resolveRange(req.query.range);

    const [response] = await client.runReport({
      property,
      dateRanges: [{ startDate, endDate: "today" }],
      dimensions: [{ name: "sessionSource" }, { name: "sessionMedium" }],
      metrics: [{ name: "sessions" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 10,
    });

    const rows = (response.rows || []).map((r) => ({
      source: r.dimensionValues[0].value,
      medium: r.dimensionValues[1].value,
      sessions: Number(r.metricValues[0].value),
    }));

    res.json(rows);
  } catch (error) {
    console.error("getTrafficSources error:", error.message);
    res.status(500).json({ message: error.message || "Failed to fetch traffic sources" });
  }
};

// GET /api/admin/analytics/realtime
export const getRealtimeUsers = async (req, res) => {
  try {
    const client = getAnalyticsClient();
    const property = getPropertyId();

    const [response] = await client.runRealtimeReport({
      property,
      metrics: [{ name: "activeUsers" }],
    });

    const activeUsers = Number(response.rows?.[0]?.metricValues?.[0]?.value || 0);

    res.json({ activeUsers });
  } catch (error) {
    console.error("getRealtimeUsers error:", error.message);
    res.status(500).json({ message: error.message || "Failed to fetch realtime users" });
  }
};
