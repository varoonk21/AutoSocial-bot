import { getPlatformRules } from "./platform-rules.js";

/**
 * Zero-config fallback: generates template-based variations when no AI key
 * is configured. Each variation takes a different angle so the user gets
 * real choice, not three copies of the same text.
 */

const STOPWORDS = new Set([
  "the", "and", "for", "with", "our", "new", "you", "your", "this", "that",
  "are", "was", "were", "has", "have", "had", "will", "would", "can", "could",
  "should", "from", "about", "into", "over", "after", "before", "between",
  "just", "like", "get", "got", "let", "say", "says", "said", "one", "two",
  "all", "any", "out", "now", "here", "there", "when", "what", "which",
]);

function hashtagBlock(topic: string, count: number): string {
  const words = topic
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w))
    .slice(0, count);
  if (words.length === 0) return "";
  return "\n\n" + words.map((w) => `#${w}`).join(" ");
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd() + "…";
}

export function templateVariations(topic: string, platform?: string): string[] {
  const rules = getPlatformRules(platform);
  const clean = topic.trim().replace(/\s+/g, " ");
  const tags = hashtagBlock(clean, rules.hashtagCount);

  const angles = [
    // 1. Direct announcement
    `${clean}${tags}`,
    // 2. Question hook
    `Have you heard about this yet?\n\n${clean}\n\nDrop your thoughts below 👇${tags}`,
    // 3. Benefit-led
    `Here's something worth your attention:\n\n${clean}\n\nSave this for later 📌${tags}`,
  ];

  return angles.map((a) => truncate(a, rules.maxLength));
}

/**
 * Template-based enhancement when no AI key is configured.
 */
export function templateEnhance(content: string, enhanceType: string, platform?: string): string {
  const rules = getPlatformRules(platform);
  const clean = content.trim();

  if (enhanceType === "hashtags") {
    const tags = hashtagBlock(clean, rules.hashtagCount);
    return truncate(tags ? `${clean}\n${tags}` : clean, rules.maxLength);
  }

  if (enhanceType === "caption") {
    return truncate(`${clean}\n\n✨ What do you think? Let us know in the comments!`, rules.maxLength);
  }

  // general: tighten + add a hook
  const sentences = clean.split(/(?<=[.!?])\s+/);
  const hook = sentences.length > 1 ? sentences[0] : clean;
  return truncate(`💡 ${hook}\n\n${sentences.slice(1).join(" ")}`.trim(), rules.maxLength);
}
