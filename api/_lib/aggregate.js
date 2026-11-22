// Pull every source for every company, score each item, and roll it up.

const COMPANIES = require("./companies");
const { SOURCES, WINDOWS } = require("./sources");
const { score } = require("./score");

const ITEMS_KEPT = 40;

function tally(items) {
  const t = { total: items.length, pos: 0, neu: 0, neg: 0, avg: 0, net: 0 };
  let sum = 0;
  for (const it of items) {
    t[it.label === "positive" ? "pos" : it.label === "negative" ? "neg" : "neu"]++;
    sum += it.score;
  }
  if (t.total) {
    t.avg = Math.round((sum / t.total) * 1000) / 1000;
    // Net sentiment: share positive minus share negative, -100..100.
    t.net = Math.round(((t.pos - t.neg) / t.total) * 100);
  }
  return t;
}

function dedupe(items) {
  const seen = new Set();
  return items.filter((it) => {
    const key = (it.title || it.text).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 90);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mentions(company, item) {
  const hay = `${item.title} ${item.text}`.toLowerCase();
  return company.match.some((m) => hay.includes(m));
}

function keep(items) {
  // Keep the strongest signals on both sides plus the most-engaged, for the detail view.
  const by = (f) => [...items].sort(f);
  const pos = by((a, b) => b.score - a.score).filter((i) => i.label === "positive").slice(0, ITEMS_KEPT / 4);
  const neg = by((a, b) => a.score - b.score).filter((i) => i.label === "negative").slice(0, ITEMS_KEPT / 4);
  const top = by((a, b) => (b.engagement || 0) - (a.engagement || 0)).slice(0, ITEMS_KEPT / 4);
  const recent = by((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, ITEMS_KEPT / 4);
  const out = new Map();
  for (const i of [...pos, ...neg, ...top, ...recent]) out.set(i.url, i);
  return [...out.values()].map(({ text, ...rest }) => ({ ...rest, text: text.slice(0, 280) }));
}

async function aggregate(windowKey = "7d") {
  if (!WINDOWS[windowKey]) windowKey = "7d";
  const status = {};
  for (const [id, s] of Object.entries(SOURCES)) status[id] = { label: s.label, kind: s.kind, ok: 0, failed: 0, items: 0, error: null };

  const jobs = COMPANIES.flatMap((c) =>
    Object.entries(SOURCES).map(async ([sid, src]) => {
      try {
        const raw = await src.fetch(c, windowKey);
        status[sid].ok++;
        return { cid: c.id, sid, items: raw };
      } catch (err) {
        status[sid].failed++;
        status[sid].error = String(err.message || err);
        return { cid: c.id, sid, items: [] };
      }
    })
  );
  const results = await Promise.all(jobs);

  const companies = COMPANIES.map((c) => {
    const mine = results.filter((r) => r.cid === c.id);
    const scored = (sid) => {
      const list = dedupe(mine.filter((r) => r.sid === sid).flatMap((r) => r.items))
        .filter((it) => SOURCES[sid].kind === "press" || mentions(c, it))
        .map((it) => {
          const s = score(it.text);
          return { ...it, score: s.compound, label: s.label };
        });
      status[sid].items += list.length;
      return list;
    };

    const press = Object.keys(SOURCES).filter((s) => SOURCES[s].kind === "press").flatMap(scored);
    const publicBySource = {};
    const publicItems = [];
    for (const sid of Object.keys(SOURCES).filter((s) => SOURCES[s].kind === "public")) {
      const list = scored(sid);
      publicBySource[sid] = tally(list);
      publicItems.push(...list);
    }

    return {
      id: c.id, name: c.name, product: c.product,
      press: { ...tally(press), items: keep(press) },
      public: { ...tally(publicItems), bySource: publicBySource, items: keep(publicItems) },
    };
  });

  return { generatedAt: new Date().toISOString(), window: windowKey, sample: false, sources: status, companies };
}

module.exports = { aggregate, tally };
