// Fetchers for each feed. Each returns a list of normalized items:
//   { text, title?, url, source, outlet?, date (ISO), engagement? }
// and throws on failure so the aggregator can record per-source status.

const UA = "web:sentiment-dashboard:v1.0 (personal research project)";
const TIMEOUT_MS = 8000;

const WINDOWS = {
  "1d": { seconds: 86400, google: "1d", reddit: "day" },
  "7d": { seconds: 7 * 86400, google: "7d", reddit: "week" },
  "30d": { seconds: 30 * 86400, google: "30d", reddit: "month" },
};

async function get(url, { headers = {}, as = "json", method = "GET", body } = {}) {
  const res = await fetch(url, {
    method,
    body,
    headers: { "User-Agent": UA, Accept: as === "json" ? "application/json" : "*/*", ...headers },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${new URL(url).host} responded ${res.status}`);
  return as === "json" ? res.json() : res.text();
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'", "#x27": "'", "#x2F": "/" };
function decode(s = "") {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e) => {
      if (ENTITIES[e] !== undefined) return ENTITIES[e];
      if (e[0] === "#") {
        const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      return m;
    });
}
function stripHtml(s = "") {
  return decode(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}
function tag(xml, name) {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decode(m[1]).trim() : "";
}

// ---------- Press: Google News RSS ----------
function parseGoogleNews(xml) {
  const items = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const block = m[1];
    const outlet = tag(block, "source");
    let title = tag(block, "title");
    // Google appends " - Outlet" to every title; strip it before scoring.
    if (outlet && title.endsWith(` - ${outlet}`)) title = title.slice(0, -(outlet.length + 3));
    const pub = tag(block, "pubDate");
    items.push({
      title,
      text: title,
      url: tag(block, "link"),
      outlet,
      source: "news",
      date: pub ? new Date(pub).toISOString() : null,
    });
  }
  return items;
}

async function fetchNews(company, windowKey) {
  const w = WINDOWS[windowKey];
  const q = `(${company.news}) when:${w.google}`;
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
  return parseGoogleNews(await get(url, { as: "text" }));
}

// ---------- Public: Reddit ----------
// Unauthenticated JSON works from many networks but is often blocked from cloud IPs.
// Set REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET (a free "script" app) to use OAuth instead.
let redditToken = null;
async function redditAuth() {
  const id = process.env.REDDIT_CLIENT_ID, secret = process.env.REDDIT_CLIENT_SECRET;
  if (!id || !secret) return null;
  if (redditToken && redditToken.expires > Date.now()) return redditToken.value;
  const json = await get("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    body: "grant_type=client_credentials",
    headers: {
      Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });
  redditToken = { value: json.access_token, expires: Date.now() + (json.expires_in - 60) * 1000 };
  return redditToken.value;
}

function parseReddit(json) {
  return (json?.data?.children || []).map(({ data: d }) => ({
    title: d.title,
    text: `${d.title}. ${(d.selftext || "").slice(0, 600)}`,
    url: `https://www.reddit.com${d.permalink}`,
    outlet: `r/${d.subreddit}`,
    source: "reddit",
    date: new Date(d.created_utc * 1000).toISOString(),
    engagement: (d.score || 0) + (d.num_comments || 0),
  }));
}

async function fetchReddit(company, windowKey) {
  const w = WINDOWS[windowKey];
  const params = `q=${encodeURIComponent(company.social)}&sort=relevance&t=${w.reddit}&limit=100&type=link&raw_json=1`;
  const token = await redditAuth();
  const json = token
    ? await get(`https://oauth.reddit.com/search?${params}`, { headers: { Authorization: `Bearer ${token}` } })
    : await get(`https://www.reddit.com/search.json?${params}`);
  return parseReddit(json);
}

// ---------- Public: Hacker News comments (Algolia) ----------
function parseHN(json) {
  return (json?.hits || []).map((h) => {
    const text = stripHtml(h.comment_text || h.story_text || h.title || "");
    return {
      title: h.story_title || h.title || "",
      text,
      url: `https://news.ycombinator.com/item?id=${h.objectID}`,
      outlet: "Hacker News",
      source: "hn",
      date: h.created_at,
      engagement: h.points || 0,
    };
  });
}

async function fetchHN(company, windowKey) {
  const since = Math.floor(Date.now() / 1000) - WINDOWS[windowKey].seconds;
  const url = `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(company.term)}&tags=comment&numericFilters=created_at_i>${since}&hitsPerPage=100`;
  return parseHN(await get(url));
}

// ---------- Public: Bluesky ----------
function parseBluesky(json) {
  return (json?.posts || []).map((p) => {
    const rkey = p.uri.split("/").pop();
    return {
      title: "",
      text: p.record?.text || "",
      url: `https://bsky.app/profile/${p.author?.handle}/post/${rkey}`,
      outlet: "Bluesky",
      source: "bluesky",
      date: p.record?.createdAt || p.indexedAt,
      engagement: (p.likeCount || 0) + (p.repostCount || 0) + (p.replyCount || 0),
    };
  });
}

async function fetchBluesky(company, windowKey) {
  const since = new Date(Date.now() - WINDOWS[windowKey].seconds * 1000).toISOString();
  const url = `https://api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=${encodeURIComponent(company.term)}&lang=en&limit=100&sort=latest&since=${since}`;
  return parseBluesky(await get(url));
}

module.exports = {
  WINDOWS,
  SOURCES: {
    news: { label: "Google News", kind: "press", fetch: fetchNews },
    reddit: { label: "Reddit", kind: "public", fetch: fetchReddit },
    hn: { label: "Hacker News", kind: "public", fetch: fetchHN },
    bluesky: { label: "Bluesky", kind: "public", fetch: fetchBluesky },
  },
  parseGoogleNews, parseReddit, parseHN, parseBluesky, stripHtml,
};
