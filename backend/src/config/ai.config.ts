import { z } from "zod";

const aiEnvSchema = z.object({
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().optional(),
  models: z.object({
    textToText: z.string().optional().default("gpt-4o"),
    imageToText: z.string().optional().default("gpt-4o"),
    image: z.string().optional().default("dall-e-3"),
  }),
  defaults: z.object({
    temperature: z.coerce.number().min(0).max(2).optional().default(1),
    maxTokens: z.coerce.number().int().min(100).max(128000).optional().default(4096),
  }),
});

const parsed = aiEnvSchema.safeParse({
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
  models: {
    textToText: process.env.TEXT_TO_TEXT_MODEL_NAME,
    imageToText: process.env.IMAGE_TO_TEXT_MODEL_NAME,
    image: process.env.IMAGE_MODEL_NAME,
  },
  defaults: {
    temperature: process.env.CHAT_TEMPERATURE,
    maxTokens: process.env.CHAT_MAX_TOKENS,
  },
});

if (!parsed.success) {
  console.error("Invalid AI environment variables:", parsed.error.flatten().fieldErrors);
  console.error("AI features will run in template-fallback mode.");
}

const aiEnv = parsed.success
  ? parsed.data
  : {
      OPENAI_API_KEY: undefined,
      OPENAI_BASE_URL: undefined,
      models: { textToText: "gpt-4o", imageToText: "gpt-4o", image: "dall-e-3" },
      defaults: { temperature: 1, maxTokens: 4096 },
    };

/** True when a real LLM key is configured; false = template-fallback mode. */
const aiEnabled = Boolean(aiEnv.OPENAI_API_KEY && aiEnv.OPENAI_API_KEY.length > 0);

export type AiEnv = z.infer<typeof aiEnvSchema>;

export default aiEnv;
export { aiEnabled };
