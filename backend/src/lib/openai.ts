import OpenAI from "openai";
import aiEnv from "../config/ai.config.js";

const openai = new OpenAI({
  baseURL: aiEnv.OPENAI_BASE_URL,
  apiKey: aiEnv.OPENAI_API_KEY,
  // Fail fast so the template fallback kicks in instead of hanging the request
  timeout: 25000,
  maxRetries: 1,
});

export default openai;
