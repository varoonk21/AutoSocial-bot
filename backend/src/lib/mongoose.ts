import mongoose from "mongoose";
import env from "../config/env.config.js";
import { logger } from "../utils/logger.util.js";
import dns from "node:dns";

dns.setServers(["1.1.1.1", "8.8.8.8"]);

export async function connectDB(): Promise<void> {
  try {
    await mongoose.connect(env.DATABASE_URL, {
      serverSelectionTimeoutMS: 10000,
    });
    logger.info("MongoDB connected");
  } catch (err) {
    logger.error({ err }, "MongoDB connection error");
    process.exit(1);
  }

  mongoose.connection.on("error", (err) => {
    logger.error({ err }, "MongoDB error");
  });
}
