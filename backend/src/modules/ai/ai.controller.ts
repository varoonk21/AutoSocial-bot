import type { Request, Response } from "express";
import * as aiService from "./ai.service.js";
import { uploadToS3 } from "../../lib/s3.js";
import { saveMediaMetadata } from "../media/media.service.js";
import { sendSuccess } from "../../utils/response.util.js";
import type { GenerateImageInput, GenerateContentFromImageInput, EnhanceContentInput, GenerateVariationsInput, EnhanceContentSafeInput } from "./ai.validation.js";


async function generateImageHandler(req: Request, res: Response) {
  const { prompt, vertical, referenceImageUrl } = req.body as GenerateImageInput;

  let base64: string;
  if (referenceImageUrl) {
    base64 = await aiService.generateImageWithReference(referenceImageUrl, prompt, vertical);
  } else {
    base64 = await aiService.generateImage(prompt, vertical);
  }

  const imageBuffer = Buffer.from(base64, "base64");
  const key = `users/${req.user!._id}/images/ai-${Date.now()}.png`;

  await uploadToS3(key, imageBuffer, "image/png");

  const media = await saveMediaMetadata(req.user!._id, {
    key,
    originalName: `ai-${prompt
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-")
      .slice(0, 20)}.png`,
    contentType: "image/png",
    fileSize: imageBuffer.length,
    source: "ai",
  });

  sendSuccess(res, { media: media.toObject() });
}

async function generateContentFromImageHandler(req: Request, res: Response) {
  const { imageUrl } = req.body as GenerateContentFromImageInput;
  const content = await aiService.generateContentFromImage(imageUrl, req.user!._id);
  sendSuccess(res, content);
}

async function enhanceContentHandler(req: Request, res: Response) {
  const { content, enhanceType } = req.body as EnhanceContentInput;
  const suggestion = await aiService.enhanceContent(content, enhanceType, req.user!._id);
  sendSuccess(res, suggestion);
}

export {
  generateImageHandler,
  generateContentFromImageHandler,
  enhanceContentHandler,
  generateVariationsHandler,
  enhanceContentSafeHandler,
  getPromptHistoryHandler,
  getAiStatusHandler,
};

async function generateVariationsHandler(req: Request, res: Response) {
  const { topic, platform, count } = req.body as GenerateVariationsInput;
  const result = await aiService.generateVariations(topic, req.user!._id, platform, count);
  sendSuccess(res, result);
}

async function enhanceContentSafeHandler(req: Request, res: Response) {
  const { content, enhanceType, platform } = req.body as EnhanceContentSafeInput;
  const result = await aiService.enhanceContentSafe(content, enhanceType, req.user!._id, platform);
  sendSuccess(res, result);
}

async function getPromptHistoryHandler(req: Request, res: Response) {
  const limit = Math.min(20, Math.max(1, parseInt(req.query.limit as string) || 10));
  const history = await aiService.getPromptHistory(req.user!._id, limit);
  sendSuccess(res, { prompts: history });
}

async function getAiStatusHandler(_req: Request, res: Response) {
  sendSuccess(res, aiService.getAiStatus());
}
