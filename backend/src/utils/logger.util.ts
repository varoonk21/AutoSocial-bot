import pino from "pino";
import env from "../config/env.config.js";

export const logger = pino({
  level: env.LOG_LEVEL,
  formatters: {
    level: (label) => ({ level: label.toUpperCase() }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(env.NODE_ENV === "development" && {
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "SYS:standard",
      },
    },
  }),
});
