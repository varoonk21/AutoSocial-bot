import express from "express";
import { validateBody } from "../../middleware/validate.middleware.js";
import {
  generateImageSchema,
  generateContentFromImageSchema,
  enhanceContentSchema,
  generateVariationsSchema,
  enhanceContentSafeSchema,
} from "./ai.validation.js";
import {
  generateImageHandler,
  generateContentFromImageHandler,
  enhanceContentHandler,
  generateVariationsHandler,
  enhanceContentSafeHandler,
  getPromptHistoryHandler,
  getAiStatusHandler,
} from "./ai.controller.js";

const router = express.Router();

router.get("/status", getAiStatusHandler);
router.get("/history", getPromptHistoryHandler);
router.post("/generate-image", validateBody(generateImageSchema), generateImageHandler);
router.post("/generate-content-from-image", validateBody(generateContentFromImageSchema), generateContentFromImageHandler);
router.post("/enhance", validateBody(enhanceContentSchema), enhanceContentHandler);
router.post("/variations", validateBody(generateVariationsSchema), generateVariationsHandler);
router.post("/enhance-safe", validateBody(enhanceContentSafeSchema), enhanceContentSafeHandler);

export default router;
