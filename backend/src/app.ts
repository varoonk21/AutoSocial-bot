import express, { Request, Response, NextFunction } from "express";
import path from "path";
import { fileURLToPath } from "url";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./config/auth.js";
import env from "./config/env.config.js";
import { serveFrontend } from "./static/serveFrontend.js";
import { requestLogger } from "./middleware/requestLogger.middleware.js";
import { logger } from "./utils/logger.util.js";
import apiRoutes from "./api.routes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Security headers (CSP disabled: the SPA ships inline scripts via Vite)
app.use(helmet({ contentSecurityPolicy: false }));

// The SPA runs on FRONTEND_URL and talks to this API with cookies
// (better-auth sessions), so cross-origin requests must allow credentials.
app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
  }),
);

app.use(requestLogger);

// Brute-force protection on the auth endpoints (login/signup/OTP).
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many auth attempts, please try again later." },
});
app.use("/api/v1/auth/", authLimiter);

// General API rate limit.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});
app.use("/api/", apiLimiter);

app.all("/api/v1/auth/{*path}", toNodeHandler(auth));

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api/v1/", apiRoutes);

// Unknown API routes are a JSON 404 — never the SPA fallback.
app.use("/api/", (_req: Request, res: Response) => {
  res.status(404).json({ error: "Not found" });
});

const frontendDist = path.join(__dirname, "../../frontend/dist");
serveFrontend(app, frontendDist);

app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err }, "Unhandled error");
  res.status(err.status || 500).json({ error: err.message || "Internal server error" });
});

export default app;
