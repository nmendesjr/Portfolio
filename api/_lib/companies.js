// The companies Sentiment tracks. An article counts toward a company when:
//   any:     one of these patterns appears in its headline or summary, or
//   withAI:  one of these patterns AND an AI term appear in the HEADLINE
//            (so "Amazon earnings" never counts, but "Amazon's new AI chips" does).
// Patterns are matched case-insensitively on word boundaries.
//   short:   label used where space is tight (phone layout, table headers)

module.exports = [
  {
    id: "openai", name: "OpenAI", short: "OpenAI", product: "ChatGPT · Sora",
    any: ["openai", "chatgpt", "sam altman", "gpt-\\d", "sora"],
  },
  {
    id: "anthropic", name: "Anthropic", short: "Anthropic", product: "Claude",
    any: ["anthropic", "claude (ai|code|opus|sonnet|haiku)", "dario amodei"],
    withAI: ["claude"],
  },
  {
    // xAI and SpaceX are one company; AI and space coverage both count.
    id: "spacex-xai", name: "SpaceX · xAI", short: "SpaceX·xAI", product: "Grok · Starlink · Starship",
    any: ["xai", "grok", "spacex", "starlink", "starship", "falcon 9"],
  },
  {
    // Gemini only — not Google search, ads, Android, antitrust, etc.
    id: "gemini", name: "Google Gemini", short: "Gemini", product: "Gemini · Google DeepMind",
    any: ["gemini", "google deepmind", "deepmind"],
  },
  {
    // Amazon's AI work only — not retail, shipping, Prime, earnings, etc.
    id: "amazon-ai", name: "Amazon AI", short: "Amazon AI", product: "Alexa+ · Bedrock · Nova · Trainium",
    any: ["alexa\\+?", "amazon bedrock", "aws bedrock", "amazon nova", "trainium", "amazon q"],
    withAI: ["amazon", "aws"],
  },
  {
    id: "microsoft", name: "Microsoft Copilot", short: "Copilot", product: "Copilot · Microsoft AI",
    any: ["copilot", "microsoft ai", "mustafa suleyman"],
    withAI: ["microsoft"],
  },
  {
    id: "perplexity", name: "Perplexity", short: "Perplexity", product: "Perplexity · Comet",
    any: ["perplexity (ai|pro|comet)", "aravind srinivas"],
    withAI: ["perplexity"],
  },
];
