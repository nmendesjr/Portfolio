// The RSS / Atom feeds Sentiment reads. This list IS the source list —
// nothing else is fetched. Add or remove outlets here.
//   outlet:  name shown on the page
//   section: which part of the publication the feed covers
//   url:     the feed itself
//   home:    the publication's site

module.exports = [
  { id: "techcrunch", outlet: "TechCrunch", section: "AI", url: "https://techcrunch.com/category/artificial-intelligence/feed/", home: "https://techcrunch.com" },
  { id: "verge", outlet: "The Verge", section: "AI", url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml", home: "https://www.theverge.com" },
  { id: "ars", outlet: "Ars Technica", section: "All", url: "https://feeds.arstechnica.com/arstechnica/index", home: "https://arstechnica.com" },
  { id: "wired", outlet: "Wired", section: "AI", url: "https://www.wired.com/feed/tag/ai/latest/rss", home: "https://www.wired.com" },
  { id: "venturebeat", outlet: "VentureBeat", section: "AI", url: "https://venturebeat.com/category/ai/feed/", home: "https://venturebeat.com" },
  { id: "mittr", outlet: "MIT Technology Review", section: "AI", url: "https://www.technologyreview.com/topic/artificial-intelligence/feed", home: "https://www.technologyreview.com" },
  { id: "register", outlet: "The Register", section: "AI + ML", url: "https://www.theregister.com/software/ai_ml/headlines.atom", home: "https://www.theregister.com" },
  { id: "engadget", outlet: "Engadget", section: "All", url: "https://www.engadget.com/rss.xml", home: "https://www.engadget.com" },
  { id: "404media", outlet: "404 Media", section: "All", url: "https://www.404media.co/rss/", home: "https://www.404media.co" },
  { id: "cnbc", outlet: "CNBC", section: "Technology", url: "https://www.cnbc.com/id/19854910/device/rss/rss.html", home: "https://www.cnbc.com" },
  { id: "nyt", outlet: "The New York Times", section: "Technology", url: "https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml", home: "https://www.nytimes.com" },
  { id: "guardian", outlet: "The Guardian", section: "Technology", url: "https://www.theguardian.com/technology/rss", home: "https://www.theguardian.com" },
  { id: "bbc", outlet: "BBC News", section: "Technology", url: "https://feeds.bbci.co.uk/news/technology/rss.xml", home: "https://www.bbc.com/news" },
  { id: "spacenews", outlet: "SpaceNews", section: "All", url: "https://spacenews.com/feed/", home: "https://spacenews.com" },
];
