import app from "./app.js";
import { connectDB } from "./lib/mongoose.js";
import { getAgenda, stopAgenda } from "./lib/agenda.js";
import { definePublishJob } from "./jobs/publish.job.js";
import { startScheduler } from "./services/scheduler.service.js";
import env from "./config/env.config.js";
import { logger } from "./utils/logger.util.js";

async function start(): Promise<void> {
  await connectDB();

  // Initialize Agenda scheduler
  const agenda = await getAgenda();
  definePublishJob(agenda);
  await startScheduler();

  app.listen(env.PORT, () => {
    logger.info(`Server running on http://localhost:${env.PORT}`);
  });
}

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("SIGTERM received, shutting down gracefully");
  await stopAgenda();
  process.exit(0);
});

process.on("SIGINT", async () => {
  logger.info("SIGINT received, shutting down gracefully");
  await stopAgenda();
  process.exit(0);
});

start().catch((err: Error) => {
  logger.error({ err }, "Failed to start");
  process.exit(1);
});
