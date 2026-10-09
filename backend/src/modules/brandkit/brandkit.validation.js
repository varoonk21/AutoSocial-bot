import { z } from "zod";

const AVAILABLE_FONTS = [
  "Inter",
  "Roboto",
  "Outfit",
  "Poppins",
  "Plus Jakarta Sans",
  "Montserrat",
  "Open Sans",
  "Lato",
];

const AVAILABLE_TONES = ["Professional", "Friendly", "Playful", "Bold", "Minimal", "Luxury"];

const objectIdOrNull = z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid ID").nullable().optional();

export const brandKitSchema = z.object({
  primaryLogo: objectIdOrNull,
  watermarkLogo: objectIdOrNull,
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Invalid hex color").optional().default("#2563EB"),
  secondaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Invalid hex color").optional().default("#FFFFFF"),
  accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Invalid hex color").optional().default("#F59E0B"),
  fonts: z.array(z.enum(AVAILABLE_FONTS)).length(2).optional().default(["Inter", "Roboto"]),
  tones: z.array(z.enum(AVAILABLE_TONES)).min(1).max(6).optional().default(["Professional", "Bold"]),
  styleNotes: z.string().max(1000).optional().default(""),
});
