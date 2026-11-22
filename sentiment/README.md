# Sentiment

How the news covers the companies building AI.

- **Page:** `/sentiment/` (static HTML/CSS/JS, no build step)
- **Data:** `/api/sentiment` (Vercel serverless function in `api/sentiment.js`), cached at the edge for 1 hour
- **Sources:** publisher RSS/Atom feeds only, listed in `api/_lib/feeds.js`. Nothing else is fetched. No social media, no aggregators.
- **Companies + matching rules:** `api/_lib/companies.js`
- **Scoring:** dependency-free lexicon scorer in `api/_lib/score.js` (headline + the outlet's summary)
- **Fallback:** if the API is unreachable (e.g. opening the page locally), the page loads `sample.json` and shows a "Sample data" banner.

Feeds only hold each outlet's most recent stories (often a few days' worth), so the
"Everything in feeds" window is however far back each feed reaches; the Sources table shows this per outlet.
Keeping longer history would need storage (e.g. a scheduled job saving daily snapshots).
