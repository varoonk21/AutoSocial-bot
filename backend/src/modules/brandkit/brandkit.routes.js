import express from "express";
import { validateBody } from "../../middleware/validate.middleware.js";
import { brandKitSchema } from "./brandkit.validation.js";
import { getBrandKit, upsertBrandKit, deleteBrandKit } from "./brandkit.controller.js";

const router = express.Router();

router.get("/", getBrandKit);
router.put("/", validateBody(brandKitSchema), upsertBrandKit);
router.delete("/", deleteBrandKit);

export default router;
