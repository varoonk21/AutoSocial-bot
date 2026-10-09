/**
 * Per-platform copy rules for AI generation. Length limits mirror each
 * provider's maxLength(); hashtag and emoji policies are platform conventions.
 */

export interface PlatformCopyRules {
  maxLength: number;
  hashtags: string;
  hashtagCount: number;
  emoji: string;
}

export const PLATFORM_COPY_RULES: Record<string, PlatformCopyRules> = {
  x: {
    maxLength: 280,
    hashtags: "1-2 short hashtags at the end, no hashtag stuffing",
    hashtagCount: 2,
    emoji: "sparingly, max 1-2",
  },
  twitter: {
    maxLength: 280,
    hashtags: "1-2 short hashtags at the end, no hashtag stuffing",
    hashtagCount: 2,
    emoji: "sparingly, max 1-2",
  },
  instagram: {
    maxLength: 2200,
    hashtags: "5-10 relevant hashtags on a separate line at the end",
    hashtagCount: 8,
    emoji: "welcome, use naturally to add warmth",
  },
  facebook: {
    maxLength: 63206,
    hashtags: "1-3 hashtags max, conversational tone preferred",
    hashtagCount: 2,
    emoji: "welcome, use naturally",
  },
  linkedin: {
    maxLength: 3000,
    hashtags: "3-5 professional hashtags at the end",
    hashtagCount: 4,
    emoji: "minimal, professional tone first",
  },
};

export function getPlatformRules(platform?: string): PlatformCopyRules {
  if (!platform) return PLATFORM_COPY_RULES.facebook;
  return PLATFORM_COPY_RULES[platform.toLowerCase()] || PLATFORM_COPY_RULES.facebook;
}

/**
 * Builds the platform-adaptation section of a generation prompt.
 */
export function platformPromptSection(platform?: string): string {
  const rules = getPlatformRules(platform);
  const label = platform || "social media";
  return (
    `Platform: ${label}. ` +
    `Keep it under ${rules.maxLength} characters. ` +
    `Hashtags: ${rules.hashtags}. ` +
    `Emoji: ${rules.emoji}.`
  );
}
