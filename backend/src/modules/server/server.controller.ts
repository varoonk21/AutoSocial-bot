import { Request, Response } from "express";
import awsEnv from "../../config/aws.config.js";
import { sendSuccess } from "../../utils/response.util.js";

export function getHealth(_req: Request, res: Response) {
  sendSuccess(res, { status: "ok" });
}

export function getConfig(_req: Request, res: Response) {
  sendSuccess(res, { s3PublicUrl: awsEnv.S3_PUBLIC_URL });
}
