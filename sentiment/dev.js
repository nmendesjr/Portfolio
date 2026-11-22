#!/usr/bin/env node
// Local preview for Sentiment, with live RSS feeds. No dependencies (Node 18+).
//
//   node sentiment/dev.js            then open http://localhost:3000/sentiment/
//   node sentiment/dev.js --check    just test every feed and print a report
//   PORT=8080 node sentiment/dev.js  use a different port
//
// It serves the repo's static files and runs the same /api/sentiment code
// Vercel runs, so what you see here is what the deployed page will show.

const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const { aggregate } = require(path.join(ROOT, "api/_lib/aggregate"));
const PORT = Number(process.env.PORT) || 3000;

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".ico": "image/x-icon", ".woff2": "font/woff2",
};

function report(data) {
  const rows = data.feeds.map((f) => [
    f.outlet, f.ok ? "ok" : "FAILED", f.ok ? String(f.stories) : "", f.ok ? String(f.matched) : "",
    f.oldest ? f.oldest.slice(0, 10) : "", f.error || "",
  ]);
  const head = ["Outlet", "Status", "Stories", "Matched", "Since", "Error"];
  const w = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (r) => r.map((c, i) => c.padEnd(w[i])).join("  ");
  console.log("\n" + line(head) + "\n" + w.map((n) => "-".repeat(n)).join("  "));
  for (const r of rows) console.log(line(r));
  const ok = data.feeds.filter((f) => f.ok).length;
  console.log(`\n${ok} of ${data.feeds.length} feeds working · ${data.articles.length} stories about tracked companies`);
  const byCo = data.companies.map((c) => `${c.name} ${data.articles.filter((a) => a.companies.includes(c.id)).length}`);
  console.log(byCo.join(" · ") + "\n");
}

// Cache feed results for 10 minutes so reloading the page doesn't re-hit every outlet.
let cache = null;
async function getData() {
  if (cache && Date.now() - cache.at < 10 * 60 * 1000) return cache.data;
  const data = await aggregate();
  cache = { at: Date.now(), data };
  report(data);
  return data;
}

async function handle(req, res) {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/api/sentiment") {
    try {
      const body = JSON.stringify(await getData());
      res.writeHead(200, { "Content-Type": TYPES[".json"], "Cache-Control": "no-store" });
      return res.end(body);
    } catch (err) {
      res.writeHead(500, { "Content-Type": TYPES[".json"] });
      return res.end(JSON.stringify({ error: String(err.message || err) }));
    }
  }
  if (url.pathname === "/" || url.pathname === "/sentiment") {
    res.writeHead(302, { Location: "/sentiment/" });
    return res.end();
  }
  let file = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname)));
  if (!file.startsWith(ROOT + path.sep) || /[\\/]\.|[\\/]api[\\/]/.test(file.slice(ROOT.length))) {
    res.writeHead(403); return res.end("Forbidden");
  }
  if (url.pathname.endsWith("/")) file = path.join(file, "index.html");
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { "Content-Type": "text/plain" }); return res.end("Not found"); }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream" });
    res.end(buf);
  });
}

if (require.main === module) {
  if (process.argv.includes("--check")) {
    console.log("Checking feeds…");
    aggregate().then((d) => { report(d); process.exit(d.feeds.some((f) => f.ok) ? 0 : 1); });
  } else {
    http.createServer(handle).listen(PORT, () => {
      console.log(`Sentiment running at http://localhost:${PORT}/sentiment/  (Ctrl+C to stop)`);
      console.log("Reading feeds…");
      getData().catch((e) => console.error("Feed read failed:", e.message));
    });
  }
}

module.exports = { handle, report };
