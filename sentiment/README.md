# Sentiment

How the press and the public feel about the companies building AI.

- **Page:** `/sentiment/` (static HTML/CSS/JS, no build step)
- **Data:** `/api/sentiment?window=1d|7d|30d` — Vercel serverless function in `api/sentiment.js`
  - Press: Google News RSS
  - Public: Reddit search, Hacker News comments (Algolia), Bluesky posts
  - Scoring: dependency-free lexicon scorer in `api/_lib/score.js`
  - Cached at the edge for 1 hour per window
- **Companies:** edit `api/_lib/companies.js`
- **Fallback:** if the API is unreachable (e.g. opening the page locally), the page loads `sample.json` and shows a "Sample data" banner.

## Optional: Reddit credentials

Reddit often blocks unauthenticated requests from cloud IPs. Create a free "script" app at
reddit.com/prefs/apps and set `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET` in the Vercel project's
environment variables; the function then uses OAuth automatically.
