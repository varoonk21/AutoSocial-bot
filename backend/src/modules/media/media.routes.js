import express from "express";
import { validateBody, validateParams } from "../../middleware/validate.middleware.js";
import { listMedia, deleteMediaHandler, getUploadUrlHandler, saveMetadataHandler, renameMediaHandler } from "./media.controller.js";
import { uploadUrlSchema, saveMetadataSchema, mediaIdParamSchema } from "./media.validation.js";

const router = express.Router();

router.get("/", listMedia);
router.post("/", validateBody(saveMetadataSchema), saveMetadataHandler);
router.put("/:id", validateParams(mediaIdParamSchema), renameMediaHandler);
router.delete("/:id", validateParams(mediaIdParamSchema), deleteMediaHandler);
router.post("/upload-url", validateBody(uploadUrlSchema), getUploadUrlHandler);

export default router;
