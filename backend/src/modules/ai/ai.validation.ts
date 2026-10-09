import { z } from "zod";

export const generateImageSchema = z.object({
  prompt: z.string().min(1, "Prompt is required"),
  vertical: z.boolean().optional().default(false),
  referenceImageUrl: z.url("Invalid URL").optional(),
});

export const generateContentFromImageSchema = z.object({
  imageUrl: z.url("Invalid image URL"),
});

export const enhanceContentSchema = z.object({
  content: z.string().min(1, "Content is required"),
  enhanceType: z.enum(["caption", "hashtags", "general"]).optional().default("general"),
});

export const generateVariationsSchema = z.object({
  topic: z.string().min(1, "Topic is required").max(2000),
  platform: z.string().max(50).optional(),
  count: z.coerce.number().int().min(1).max(5).optional().default(3),
});

export const enhanceContentSafeSchema = z.object({
  content: z.string().min(1, "Content is required"),
  enhanceType: z.enum(["caption", "hashtags", "general"]).optional().default("general"),
  platform: z.string().max(50).optional(),
});

export type GenerateImageInput = z.infer<typeof generateImageSchema>;
export type GenerateContentFromImageInput = z.infer<typeof generateContentFromImageSchema>;
export type EnhanceContentInput = z.infer<typeof enhanceContentSchema>;
export type GenerateVariationsInput = z.infer<typeof generateVariationsSchema>;
export type EnhanceContentSafeInput = z.infer<typeof enhanceContentSafeSchema>;
