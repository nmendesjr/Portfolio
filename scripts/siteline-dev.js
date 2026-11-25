// Run Siteline locally without Vercel.
//   CENSUS_API_KEY=your_key node scripts/siteline-dev.js
// then open http://localhost:5055/siteline/
// Requires Node 18+ (built-in fetch). No dependencies.

const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.env.PORT) || 5055;
const handler = require(path.join(ROOT, "api", "siteline.js"));

if (!process.env.CENSUS_API_KEY) {
  console.warn("Warning: CENSUS_API_KEY is not set, so lookups will fail. Get one at https://api.census.gov/data/key_signup.html");
}

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml" };

http
  .createServer((req, res) => {
    // Shim the small part of Vercel's response API the handler uses.
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (obj) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(obj)); };

    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (url.pathname === "/api/siteline") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => { req.body = body; handler(req, res); });
      return;
    }

    let file = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname)));
    if (!file.startsWith(ROOT)) { res.statusCode = 403; return res.end(); }
    if (url.pathname.endsWith("/")) file = path.join(file, "index.html");
    fs.readFile(file, (err, data) => {
      if (err) { res.statusCode = 404; return res.end("Not found"); }
      res.setHeader("Content-Type", TYPES[path.extname(file)] || "application/octet-stream");
      res.end(data);
    });
  })
  .listen(PORT, () => console.log(`Siteline running at http://localhost:${PORT}/siteline/`));
