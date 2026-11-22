// The companies Sentiment tracks. Edit this list to change coverage.
//   news:   Google News search query (press coverage)
//   social: Reddit search query (public chatter)
//   term:   single keyword for Hacker News / Bluesky search (no OR support)
//   match:  a post must contain one of these (case-insensitive) to count —
//           filters out search noise like "perplexity" used as a plain word.

module.exports = [
  {
    id: "openai", term: "OpenAI", name: "OpenAI", product: "ChatGPT",
    news: 'OpenAI OR ChatGPT OR "Sam Altman"',
    social: "OpenAI OR ChatGPT",
    match: ["openai", "chatgpt", "gpt-", "sam altman", "sora"],
  },
  {
    id: "anthropic", term: "Anthropic", name: "Anthropic", product: "Claude",
    news: 'Anthropic OR "Claude AI" OR "Dario Amodei"',
    social: "Anthropic OR \"Claude AI\" OR \"Claude Code\"",
    match: ["anthropic", "claude"],
  },
  {
    id: "xai", term: "Grok", name: "xAI", product: "Grok",
    news: 'xAI OR "Grok AI" OR "Grok chatbot"',
    social: "Grok OR xAI",
    match: ["xai", "grok"],
  },
  {
    id: "spacex", term: "SpaceX", name: "SpaceX", product: "Starlink · Starship",
    news: "SpaceX OR Starlink OR Starship",
    social: "SpaceX OR Starlink OR Starship",
    match: ["spacex", "starlink", "starship", "falcon 9"],
  },
  {
    id: "google", term: "Gemini", name: "Google", product: "Gemini",
    news: '"Google Gemini" OR "Gemini AI" OR "Google DeepMind"',
    social: "Gemini AI OR \"Google Gemini\" OR DeepMind",
    match: ["gemini", "deepmind", "google ai", "bard"],
  },
  {
    id: "amazon", term: "Alexa", name: "Amazon", product: "Alexa+ · Bedrock · Nova",
    news: '"Amazon AI" OR "Alexa+" OR "Amazon Bedrock" OR "Amazon Nova" OR "AWS AI"',
    social: "\"Alexa+\" OR \"Amazon AI\" OR Bedrock OR \"Amazon Nova\"",
    match: ["alexa", "bedrock", "amazon nova", "amazon ai", "aws ai", "amazon's ai", "trainium"],
  },
  {
    id: "microsoft", term: "Copilot", name: "Microsoft", product: "Copilot",
    news: '"Microsoft Copilot" OR "Copilot AI" OR "Microsoft AI"',
    social: "\"Microsoft Copilot\" OR \"Copilot AI\" OR \"Windows Copilot\"",
    match: ["copilot", "microsoft ai", "mustafa suleyman"],
  },
  {
    id: "perplexity", term: "Perplexity", name: "Perplexity", product: "Perplexity · Comet",
    news: '"Perplexity AI" OR "Aravind Srinivas" OR "Perplexity Comet"',
    social: "\"Perplexity AI\" OR \"Perplexity Pro\" OR \"Perplexity Comet\"",
    match: ["perplexity"],
  },
];
