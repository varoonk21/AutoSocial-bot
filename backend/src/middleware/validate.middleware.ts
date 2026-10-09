import type { Request, Response, NextFunction } from "express";
import { z, ZodError, type ZodType } from "zod";
import { AppError } from "../utils/appError.util.js";

function createValidator<T extends keyof Request>(source: T, schema: ZodType) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const parsed = schema.parse(req[source]);
      Object.assign(req[source], parsed);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        throw new AppError(error.issues[0]?.message || "Validation error", 400, "VALIDATION_ERROR", z.treeifyError(error));
      }
      next(error);
    }
  };
}

export const validateBody = (schema: ZodType) => createValidator("body", schema);
export const validateParams = (schema: ZodType) => createValidator("params", schema);
export const validateQuery = (schema: ZodType) => createValidator("query", schema);
