// Read every feed, keep the stories that mention a tracked company, score them.
// Returns raw scored articles; the page does the tallying so it can filter by
// time window and outlet without another request.

const FEEDS = require("./feeds");
const COMPANIES = require("./companies");
const { fetchFeed } = require("./rss");
const { score } = require("./score");

const AI_RE = /\b(ai|a\.i\.|artificial intelligence|chatbots?|llms?|language models?|ai models?|agents?|agentic|machine learning|generative|gen ?ai|data ?cent(er|re)s?|gpus?|ai chips?)\b/i;

const matchers = COMPANIES.map((c) => ({
  id: c.id,
  any: c.any ? new RegExp(`\\b(${c.any.join("|")})(?![\\w])`, "i") : null,
  withAI: c.withAI ? new RegExp(`\\b(${c.withAI.join("|")})\\b`, "i") : null,
}));

function companiesIn(text) {
  const hasAI = AI_RE.test(text);
  return matchers
    .filter((m) => (m.any && m.any.test(text)) || (m.withAI && hasAI && m.withAI.test(text)))
    .map((m) => m.id);
}

const normTitle = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

async function aggregate() {
  const results = await Promise.all(FEEDS.map(async (f) => {
    try { return { feed: f, items: await fetchFeed(f) }; }
    catch (err) { return { feed: f, items: [], error: String(err.message || err) }; }
  }));

  const seenUrl = new Set(), seenTitle = new Set();
  const articles = [];
  const feeds = results.map(({ feed, items, error }) => {
    let matched = 0, oldest = null;
    for (const it of items) {
      if (it.date && (!oldest || it.date < oldest)) oldest = it.date;
      const text = `${it.title}. ${it.summary}`;
      const ids = companiesIn(text);
      if (!ids.length) continue;
      const tkey = normTitle(it.title);
      if (seenUrl.has(it.url) || seenTitle.has(tkey)) continue;
      seenUrl.add(it.url); seenTitle.add(tkey);
      // Score the headline plus the outlet's own summary of the story.
      const s = score(text);
      articles.push({
        title: it.title, url: it.url, summary: it.summary.slice(0, 220), date: it.date,
        feed: feed.id, outlet: feed.outlet, companies: ids, score: s.compound, label: s.label,
      });
      matched++;
    }
    return {
      id: feed.id, outlet: feed.outlet, section: feed.section, url: feed.url, home: feed.home,
      ok: !error, error: error || null, stories: items.length, matched, oldest,
    };
  });

  articles.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return {
    generatedAt: new Date().toISOString(),
    sample: false,
    feeds,
    companies: COMPANIES.map(({ id, name, product }) => ({ id, name, product })),
    articles,
  };
}

module.exports = { aggregate, companiesIn };
