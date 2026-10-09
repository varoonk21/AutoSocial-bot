import { Router } from "express";
import { getHealth, getConfig } from "./server.controller.js";

const router = Router();

router.get("/health", getHealth);
router.get("/config", getConfig);

export default router;
