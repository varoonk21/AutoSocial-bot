import { betterAuth } from "better-auth";
import { mongooseAdapter } from "better-auth-mongoose";
import mongoose from "mongoose";
import env from "./env.config.js";
import { logger } from "../utils/logger.util.js";

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: mongooseAdapter(mongoose.connection, {
    schemas: {
      user: new mongoose.Schema({
        role: { type: String, default: "user" },
      }),
    },
  }),
  emailAndPassword: {
    enabled: true,
    sendResetPassword: async ({ user, url, token }, request) => {
      // In a real application, you would send this URL via an email provider (e.g. Resend, Nodemailer)
      logger.info(`[Better Auth] Password Reset Request for ${user.email}`);
      logger.info(`[Better Auth] Click here to reset your password: ${url}`);
    },
  },
  trustedOrigins: [env.FRONTEND_URL],
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  basePath: "/api/v1/auth",
  user: {
    modelName: "user",
  },
  account: {
    modelName: "account",
  },
  verification: {
    modelName: "verification",
  },
});
