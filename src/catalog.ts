export const KNOWN_AI_CRAWLER_TOKENS = Object.freeze([
  "ChatGPT-User", "OAI-SearchBot", "OAI-AdsBot", "GPTBot",
  "Claude-User", "Claude-SearchBot", "ClaudeBot",
  "Perplexity-User", "PerplexityBot",
  "Google-InspectionTool", "Google-CloudVertexBot", "Google-NotebookLM",
  "Google-Read-Aloud", "Google-Agent", "GoogleAgent", "GoogleOther", "Googlebot",
  "Bingbot", "msnbot", "Copilot", "Applebot", "Amzn-SearchBot", "Amzn-User",
  "Amazonbot", "DuckAssistBot", "meta-externalfetcher", "meta-externalagent",
  "facebookexternalhit", "FacebookBot", "Grok-DeepSearch", "xAI-SearchBot",
  "xAI-Web-Crawler", "xAI-Bot", "GrokBot", "MistralAI-User", "MistralAI-Index",
  "Kimi-SearchBot", "Kimi-User", "KimiBot", "TikTokSpider", "Bytespider",
  "Doubaobot", "Baiduspider", "ERNIEBot", "Qwen-User", "QwenBot", "DeepSeekBot",
  "cohere-training-data-crawler", "cohere-ai", "AI2Bot", "CCBot", "YouBot",
]);

export const GENERIC_BOT_HINTS = Object.freeze(["bot", "crawler", "spider", "slurp", "fetcher", "headless"]);
export const IGNORED_EXTENSION_PATTERNS = Object.freeze([
  "avif", "bmp", "br", "cjs", "css", "eot", "gif", "gz", "ico", "jpe?g", "js", "map", "mjs", "mov",
  "mp3", "mp4", "otf", "png", "svg", "ttf", "wasm", "wav", "webm", "webmanifest", "webp", "woff2?", "zip",
]);
export const GENERIC_BOT_HINT_SOURCE = `(?:${GENERIC_BOT_HINTS.join("|")})`;
export const IGNORED_EXTENSION_SOURCE = `\\.(?:${IGNORED_EXTENSION_PATTERNS.join("|")})(?:$|\\/)`;
const GENERIC_BOT_HINT = new RegExp(GENERIC_BOT_HINT_SOURCE, "i");
const IGNORED_EXTENSION = new RegExp(IGNORED_EXTENSION_SOURCE, "i");
const CRAWLER_FILE = /(?:^|\/)(?:robots\.txt|llms(?:-full)?\.txt|sitemap(?:[-_.][^/]*)?\.xml|[^/]+\.md)$/i;

function stableFraction(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0x1_0000_0000;
}

export type CandidateDecision = {
  track: boolean;
  sampleRate?: number;
  reason: "known_ai" | "sampled_bot" | "other_bot" | "ignored";
};

export function candidateDecision(input: {
  userAgent: string;
  path: string;
  method: string;
  captureOtherBots?: boolean;
  unknownBotSampleRate?: number;
  sampleKey?: string;
}): CandidateDecision {
  const method = String(input.method || "GET").toUpperCase();
  const path = String(input.path || "/").split(/[?#]/, 1)[0] || "/";
  const userAgent = String(input.userAgent || "").slice(0, 2048);
  if (!userAgent || (method !== "GET" && method !== "HEAD")) {
    return { track: false, reason: "ignored" };
  }
  if ((path.startsWith("/api/") || path.startsWith("/_next/") || IGNORED_EXTENSION.test(path)) && !CRAWLER_FILE.test(path)) {
    return { track: false, reason: "ignored" };
  }
  const normalized = userAgent.toLowerCase();
  if (KNOWN_AI_CRAWLER_TOKENS.some((token) => normalized.includes(token.toLowerCase()))) {
    return { track: true, reason: "known_ai" };
  }
  if (!GENERIC_BOT_HINT.test(userAgent)) return { track: false, reason: "ignored" };
  if (input.captureOtherBots) return { track: true, reason: "other_bot" };
  const sampleRate = Math.max(0, Math.min(1, input.unknownBotSampleRate ?? 0.01));
  if (sampleRate === 0 || stableFraction(input.sampleKey || `${userAgent}\n${path}`) >= sampleRate) {
    return { track: false, reason: "ignored" };
  }
  return { track: true, sampleRate, reason: "sampled_bot" };
}
