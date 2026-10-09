import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3000),
  FRONTEND_URL: z.string(),
  DATABASE_URL: z.string(),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().default("http://localhost:3000"),
  LOG_LEVEL: z
    .string()
    .optional()
    .default("info")
    .transform((v) => v.toLowerCase())
    .refine((v) => ["trace", "debug", "info", "warn", "error", "fatal"].includes(v), {
      message: "Invalid log level. Use trace/debug/info/warn/error/fatal",
    }),

  // ─── Security (required: OAuth tokens are encrypted at rest) ──
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "TOKEN_ENCRYPTION_KEY must be 64 hex characters (32 bytes). Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""),

  // ─── AI (required: caption/hashtag/image generation are core features) ──
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required for AI features"),

  // ─── Media storage (required: media library + scheduled posts need it) ──
  AWS_S3_BUCKET: z.string().min(1, "AWS_S3_BUCKET is required for the media library"),
  AWS_ACCESS_KEY_ID: z.string().min(1, "AWS_ACCESS_KEY_ID is required for the media library"),
  AWS_SECRET_ACCESS_KEY: z.string().min(1, "AWS_SECRET_ACCESS_KEY is required for the media library"),

  // ─── Social providers (optional: each network can be connected later) ──
  FACEBOOK_APP_ID: z.string().optional(),
  FACEBOOK_APP_SECRET: z.string().optional(),
  LINKEDIN_CLIENT_ID: z.string().optional(),
  LINKEDIN_CLIENT_SECRET: z.string().optional(),
  X_API_KEY: z.string().optional(),
  X_API_SECRET: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
  console.error("See backend/.example.env for the full list of required variables.");
  process.exit(1);
}

const env = parsed.data;

// Warn (don't crash) about social providers that can't be connected yet.
const providerChecks: Array<[string, string[]]> = [
  ["Facebook/Instagram", ["FACEBOOK_APP_ID", "FACEBOOK_APP_SECRET"]],
  ["LinkedIn", ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"]],
  ["X/Twitter", ["X_API_KEY", "X_API_SECRET"]],
];
for (const [label, keys] of providerChecks) {
  const missing = keys.filter((k) => !(parsed.data as Record<string, unknown>)[k]);
  if (missing.length > 0 && missing.length < keys.length) {
    console.warn(`[env] ${label}: partially configured (missing ${missing.join(", ")}). OAuth for ${label} will fail until all keys are set.`);
  } else if (missing.length === keys.length) {
    console.warn(`[env] ${label}: not configured. Connect flows for ${label} are disabled until its keys are set.`);
  }
}

if (!process.env.S3_PUBLIC_URL) {
  console.warn(
    "[env] S3_PUBLIC_URL is not set: media links will be presigned URLs expiring after " +
      `${process.env.S3_PRESIGNED_URL_EXPIRY ?? 300}s. Posts store the S3 key and the publish job ` +
      "re-signs at publish time, so scheduled posts keep working; set S3_PUBLIC_URL to a public " +
      "bucket/CDN base URL for permanent links.",
  );
}

export type Env = z.infer<typeof envSchema>;

export default env;
