// GET /api/sentiment?window=1d|7d|30d
// Aggregates press + public sentiment for the tracked AI companies.
// Cached at Vercel's edge for an hour so feeds are hit at most ~once/hour per window.

const { aggregate } = require("./_lib/aggregate");

module.exports = async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const windowKey = url.searchParams.get("window") || "7d";
  try {
    const data = await aggregate(windowKey);
    const anyData = data.companies.some((c) => c.press.total + c.public.total > 0);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    // Don't cache an empty result (every feed failed) for long.
    res.setHeader("Cache-Control", anyData
      ? "public, s-maxage=3600, stale-while-revalidate=86400"
      : "public, s-maxage=60");
    res.statusCode = 200;
    res.end(JSON.stringify(data));
  } catch (err) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: String(err.message || err) }));
  }
};
