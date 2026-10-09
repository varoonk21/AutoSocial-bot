import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
import { logger } from "../utils/logger.util.js";

export const requestLogger: RequestHandler = (req, res, next) => {
  const requestId = randomUUID();
  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  const start = performance.now();
  res.on("finish", () => {
    const durationMs = Math.round(performance.now() - start);
    logger.info({ requestId, method: req.method, path: req.path, status: res.statusCode, durationMs }, "http_request");
  });
  next();
};
