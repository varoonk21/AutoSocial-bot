import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import aiEnv, { aiEnabled } from "../../config/ai.config.js";
import openai from "../../lib/openai.js";
import { findByUserId } from "../brandkit/brandkit.repository.js";
import { getGenerateSinglePostFromImagePrompt, getEnhanceCaptionPrompt, getEnhanceHashtagsPrompt, getEnhanceGeneralPrompt } from "./prompts/index.js";
import { getPlatformRules, platformPromptSection } from "./platform-rules.js";
import { templateVariations, templateEnhance } from "./template-fallback.js";
import { checkTone, type ToneCheck } from "./tone-check.js";
import { AiPrompt, type IBrandKit } from "../../models/index.js";

const suggestionSchema = z.object({
  post: z.string(),
});

const imageContentSchema = z.object({
  description: z.string(),
  hashtags: z.string(),
});

type Suggestion = z.infer<typeof suggestionSchema>;
type ImageContent = z.infer<typeof imageContentSchema>;

function buildBrandContext(brandKit: IBrandKit | null): string {
  if (!brandKit) return "";
  const parts: string[] = [];
  if (brandKit.tones?.length) parts.push(`Tone/Voice: ${brandKit.tones.join(", ")}`);
  if (brandKit.fonts?.length) parts.push(`Preferred fonts: ${brandKit.fonts.join(", ")}`);
  if (brandKit.styleNotes) parts.push(`Style notes: ${brandKit.styleNotes}`);
  if (brandKit.primaryColor) parts.push(`Primary brand color: ${brandKit.primaryColor}`);
  if (brandKit.accentColor) parts.push(`Accent color: ${brandKit.accentColor}`);
  return parts.length ? `\nBrand guidelines: ${parts.join(". ")}.` : "";
}

export async function generateImage(prompt: string, isVertical: boolean = false): Promise<string> {
  const result = await openai.images.generate({
    prompt,
    model: aiEnv.models.image,
    size: isVertical ? "1024x1792" : "1024x1024",
    response_format: "b64_json",
  });

  return result.data[0].b64_json;
}

export async function generateImageWithReference(imageUrl: string, prompt: string, isVertical: boolean = false): Promise<string> {
  const result = await openai.images.edit({
    model: aiEnv.models.image,
    image: imageUrl as unknown as File,
    prompt,
    size: isVertical ? "1024x1792" : "1024x1024",
    response_format: "b64_json",
  });

  return result.data[0].b64_json;
}

export async function generateContentFromImage(imageUrl: string, userId: string): Promise<ImageContent | null> {
  const brandKit = await findByUserId(userId);
  const brandContext = buildBrandContext(brandKit as IBrandKit | null);

  const result = await openai.chat.completions.parse({
    model: aiEnv.models.imageToText,
    messages: [
      {
        role: "system",
        content: getGenerateSinglePostFromImagePrompt(brandContext),
      },
      {
        role: "user",
        content: [
          { type: "text", text: "Generate a social media post for this image." },
          { type: "image_url", image_url: { url: imageUrl } },
        ],
      },
    ],
    n: 1,
    temperature: aiEnv.defaults.temperature,
    response_format: zodResponseFormat(imageContentSchema, "image_content"),
  });

  return result.choices[0].message.parsed || null;
}

export async function enhanceContent(content: string, enhanceType: string, userId: string): Promise<Suggestion | null> {
  const brandKit = await findByUserId(userId);
  const brandContext = buildBrandContext(brandKit as IBrandKit | null);

  let systemPrompt: string;
  if (enhanceType === "caption") {
    systemPrompt = getEnhanceCaptionPrompt(brandContext);
  } else if (enhanceType === "hashtags") {
    systemPrompt = getEnhanceHashtagsPrompt(brandContext);
  } else {
    systemPrompt = getEnhanceGeneralPrompt(brandContext);
  }

  const result = await openai.chat.completions.parse({
    model: aiEnv.models.textToText,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content },
    ],
    n: 1,
    temperature: aiEnv.defaults.temperature,
    response_format: zodResponseFormat(suggestionSchema, "enhanced_content"),
  });

  return result.choices[0].message.parsed || null;
}

const variationSchema = z.object({
  variations: z.array(z.string()).min(1).max(5),
});

export interface GeneratedVariation {
  text: string;
  toneCheck: ToneCheck;
}

export interface VariationsResult {
  variations: GeneratedVariation[];
  aiGenerated: boolean;
  brandContext: string;
  platform?: string;
}

/**
 * Generates N variations of a post from a topic/prompt.
 * - With an AI key: real LLM output, brand-aware, platform-adapted.
 * - Without: template-based variations (never errors, never 404s).
 * Always records the prompt in history and runs a tone check.
 */
export async function generateVariations(
  topic: string,
  userId: string,
  platform?: string,
  count: number = 3
): Promise<VariationsResult> {
  const brandKit = (await findByUserId(userId)) as IBrandKit | null;
  const brandContext = buildBrandContext(brandKit);
  const tones = brandKit?.tones || [];
  const n = Math.min(5, Math.max(1, count));

  let texts: string[];
  let aiGenerated = false;

  if (aiEnabled) {
    try {
      const systemPrompt =
        `You are a social media copywriter. Write ${n} distinct variations of a post about the topic below. ` +
        `Each variation should take a different angle (announcement, question hook, benefit-led, story, etc.). ` +
        platformPromptSection(platform) +
        (brandContext ? `\n${brandContext}` : "") +
        `\nReturn only the variations, no numbering or commentary.`;

      const result = await openai.chat.completions.parse({
        model: aiEnv.models.textToText,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: topic },
        ],
        temperature: aiEnv.defaults.temperature,
        response_format: zodResponseFormat(variationSchema, "variations"),
      });

      const parsed = result.choices[0].message.parsed;
      if (parsed && parsed.variations.length > 0) {
        const rules = getPlatformRules(platform);
        texts = parsed.variations.slice(0, n).map((v) =>
          v.length > rules.maxLength ? v.slice(0, rules.maxLength - 1).trimEnd() + "…" : v
        );
        aiGenerated = true;
      } else {
        texts = templateVariations(topic, platform).slice(0, n);
      }
    } catch {
      // LLM failed — degrade to templates rather than erroring
      texts = templateVariations(topic, platform).slice(0, n);
    }
  } else {
    texts = templateVariations(topic, platform).slice(0, n);
  }

  // Record prompt history (best-effort)
  try {
    await AiPrompt.create({ userId, prompt: topic.slice(0, 2000), platform, mode: "variations" });
  } catch {
    // history is non-critical
  }

  return {
    variations: texts.map((text) => ({ text, toneCheck: checkTone(text, tones) })),
    aiGenerated,
    brandContext: brandContext || "No brand kit set — using neutral defaults.",
    platform,
  };
}

/**
 * Enhance existing content. Falls back to templates when no AI key.
 */
export async function enhanceContentSafe(
  content: string,
  enhanceType: string,
  userId: string,
  platform?: string
): Promise<{ suggestion: string; aiGenerated: boolean; toneCheck: ToneCheck }> {
  const brandKit = (await findByUserId(userId)) as IBrandKit | null;
  const tones = brandKit?.tones || [];

  try {
    await AiPrompt.create({ userId, prompt: content.slice(0, 2000), platform, mode: "enhance" });
  } catch {}

  if (!aiEnabled) {
    const suggestion = templateEnhance(content, enhanceType, platform);
    return { suggestion, aiGenerated: false, toneCheck: checkTone(suggestion, tones) };
  }

  try {
    const result = await enhanceContent(content, enhanceType, userId);
    const suggestion = result?.post || templateEnhance(content, enhanceType, platform);
    const aiGenerated = Boolean(result?.post);
    return { suggestion, aiGenerated, toneCheck: checkTone(suggestion, tones) };
  } catch {
    const suggestion = templateEnhance(content, enhanceType, platform);
    return { suggestion, aiGenerated: false, toneCheck: checkTone(suggestion, tones) };
  }
}

/**
 * Recent prompt history for the user.
 */
export async function getPromptHistory(userId: string, limit: number = 10) {
  return AiPrompt.find({ userId })
    .sort({ createdAt: -1 })
    .limit(Math.min(20, Math.max(1, limit)))
    .lean();
}

/**
 * Whether real AI generation is available (key configured).
 */
export function getAiStatus() {
  return { aiEnabled, provider: aiEnabled ? "openai" : "template" };
}
