// Minimal, dependency-free RSS 2.0 + Atom reader.

const UA = "Mozilla/5.0 (compatible; SentimentDashboard/1.0; personal research project)";
const TIMEOUT_MS = 8000;

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
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
function clean(s = "") {
  // Decode first (feeds often entity-encode their HTML), then strip tags.
  return decode(decode(s)).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
function tag(xml, name) {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m ? m[1] : "";
}
function toISO(s) {
  const d = new Date(clean(s));
  return isNaN(d) ? null : d.toISOString();
}

function parseFeed(xml) {
  const items = [];
  const isAtom = /<feed[\s>]/i.test(xml) && !/<rss[\s>]/i.test(xml);
  const blocks = isAtom ? xml.matchAll(/<entry[\s>]([\s\S]*?)<\/entry>/g) : xml.matchAll(/<item[\s>]([\s\S]*?)<\/item>/g);
  for (const m of blocks) {
    const b = m[1];
    let url;
    if (isAtom) {
      const alt = b.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i) || b.match(/<link[^>]*href=["']([^"']+)["']/i);
      url = alt ? decode(alt[1]) : "";
    } else {
      url = clean(tag(b, "link")) || clean(tag(b, "guid"));
    }
    const title = clean(tag(b, "title"));
    if (!title || !/^https?:\/\//.test(url)) continue;
    const summary = clean(tag(b, "description") || tag(b, "summary") || tag(b, "content")).slice(0, 400);
    const date = toISO(tag(b, "pubDate") || tag(b, "published") || tag(b, "updated") || tag(b, "dc:date"));
    items.push({ title, url, summary, date });
  }
  return items;
}

async function fetchFeed(feed) {
  const res = await fetch(feed.url, {
    headers: { "User-Agent": UA, Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const items = parseFeed(await res.text());
  if (!items.length) throw new Error("feed returned no stories");
  return items;
}

module.exports = { parseFeed, fetchFeed, clean };
