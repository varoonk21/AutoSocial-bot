import express from "express";
import { getSettings, updateSettings } from "./settings.controller.js";
import { validateBody } from "../../middleware/validate.middleware.js";
import { updateSettingsSchema } from "./settings.validation.js";

const router = express.Router();

router.get("/", getSettings);
router.put("/", validateBody(updateSettingsSchema), updateSettings);

export default router;
