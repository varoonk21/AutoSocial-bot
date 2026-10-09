import express from "express";
import {
  listIntegrations,
  getOAuthUrl,
  oauthCallback,
  getPages,
  savePage,
  deleteIntegration,
  toggleDisable,
} from "../controllers/integrations.controller.js";
import { validateBody, validateParams, validateQuery } from "../middleware/validate.middleware.js";
import {
  providerParamSchema,
  integrationIdParamSchema,
  savePageSchema,
  tempStateQuerySchema,
  toggleDisableSchema,
} from "./integrations.validation.js";

const router = express.Router();

router.get("/list", listIntegrations);
router.get("/social/:provider", validateParams(providerParamSchema), getOAuthUrl);
router.get(
  "/social/:provider/callback",
  validateParams(providerParamSchema),
  oauthCallback,
);
router.get(
  "/social/:provider/pages",
  validateParams(providerParamSchema),
  validateQuery(tempStateQuerySchema),
  getPages,
);
router.post(
  "/social/:provider/page",
  validateParams(providerParamSchema),
  validateBody(savePageSchema),
  savePage,
);
router.delete("/:id", validateParams(integrationIdParamSchema), deleteIntegration);
router.put(
  "/:id/disable",
  validateParams(integrationIdParamSchema),
  validateBody(toggleDisableSchema),
  toggleDisable,
);

export default router;
