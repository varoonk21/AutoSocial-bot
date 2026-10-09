import type { Response } from "express";
import { AppError } from "./appError.util.js";

export function sendSuccess<T>(res: Response, data: T, status: number = 200) {
  const requestId = res.req.requestId ?? "unknown";
  return res.status(status).json({ data, meta: { requestId, timestamp: new Date().toISOString() } });
}

export function sendPaginated<T>(res: Response, data: T[], total: number, page: number, pageSize: number, status: number = 200, extraMeta?: Record<string, unknown>) {
  const requestId = res.req.requestId ?? "unknown";
  return res.status(status).json({
    data,
    meta: {
      requestId,
      timestamp: new Date().toISOString(),
      page,
      pageSize,
      total,
      pageCount: Math.ceil(total / pageSize) || 0,
      ...extraMeta,
    },
  });
}

export function sendError(res: Response, err: AppError) {
  const requestId = res.req.requestId ?? "unknown";
  const body: { error: { code: string; message: string; details?: unknown }; meta: { requestId: string; timestamp: string } } = {
    error: { code: err.code, message: err.message },
    meta: { requestId, timestamp: new Date().toISOString() },
  };
  if (err.details !== undefined) {
    body.error.details = err.details;
  }
  return res.status(err.status).json(body);
}
