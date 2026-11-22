// GET /api/sentiment
// Reads the publisher RSS feeds in _lib/feeds.js, keeps stories that mention a
// tracked AI company, and scores each one. Cached at Vercel's edge for an hour.

const { aggregate } = require("./_lib/aggregate");

module.exports = async (req, res) => {
  try {
    const data = await aggregate();
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    // If every feed failed, don't pin that result in the cache.
    res.setHeader("Cache-Control", data.feeds.some((f) => f.ok)
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
