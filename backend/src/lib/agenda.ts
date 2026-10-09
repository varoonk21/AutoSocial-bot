import { Agenda } from "agenda";
import { MongoBackend } from "@agendajs/mongo-backend";
import env from "../config/env.config.js";
import { logger } from "../utils/logger.util.js";

let agenda: Agenda | null = null;

export async function getAgenda(): Promise<Agenda> {
  if (agenda) return agenda;

  const backend = new MongoBackend({
    address: env.DATABASE_URL,
    collection: "agenda_jobs",
  });

  agenda = new Agenda({
    backend,
    processEvery: "10 seconds",
    defaultConcurrency: 5,
    defaultLockLifetime: 60000,
  });

  agenda.on("start", (job) => {
    logger.info(`Job starting: ${job.attrs.name}`);
  });

  agenda.on("complete", (job) => {
    logger.info(`Job completed: ${job.attrs.name}`);
  });

  agenda.on("fail", (err, job) => {
    logger.error({ err }, `Job failed: ${job.attrs.name}`);
  });

  await agenda.start();
  logger.info("Agenda scheduler started");

  return agenda;
}

export async function stopAgenda(): Promise<void> {
  if (agenda) {
    await agenda.stop();
    agenda = null;
    logger.info("Agenda scheduler stopped");
  }
}

export { Agenda };
