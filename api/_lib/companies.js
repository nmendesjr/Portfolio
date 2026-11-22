// The companies Sentiment tracks. An article counts toward a company when its
// title or summary matches:
//   any:    one of these patterns on its own, or
//   withAI: one of these patterns AND an AI term in the same article
//           (so "Amazon earnings" doesn't count, but "Amazon's AI chips" does).
// Patterns are matched case-insensitively on word boundaries.

module.exports = [
  {
    id: "openai", name: "OpenAI", product: "ChatGPT",
    any: ["openai", "chatgpt", "sam altman", "gpt-\\d", "sora"],
  },
  {
    id: "anthropic", name: "Anthropic", product: "Claude",
    any: ["anthropic", "claude (ai|code|opus|sonnet|haiku)", "dario amodei"],
    withAI: ["claude"],
  },
  {
    id: "xai", name: "xAI", product: "Grok",
    any: ["xai", "grok"],
  },
  {
    id: "spacex", name: "SpaceX", product: "Starlink · Starship",
    any: ["spacex", "starlink", "starship", "falcon 9"],
  },
  {
    id: "google", name: "Google", product: "Gemini",
    any: ["gemini", "deepmind", "google ai", "notebooklm"],
    withAI: ["google", "alphabet"],
  },
  {
    id: "amazon", name: "Amazon", product: "Alexa+ · Bedrock · Nova",
    any: ["alexa\\+?", "amazon bedrock", "amazon nova", "trainium"],
    withAI: ["amazon", "aws"],
  },
  {
    id: "microsoft", name: "Microsoft", product: "Copilot",
    any: ["copilot", "microsoft ai", "mustafa suleyman"],
    withAI: ["microsoft"],
  },
  {
    id: "perplexity", name: "Perplexity", product: "Perplexity · Comet",
    any: ["perplexity (ai|pro|comet)", "aravind srinivas"],
    withAI: ["perplexity"],
  },
];
