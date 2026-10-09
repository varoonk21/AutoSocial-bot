import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";
import { uploadToS3, getS3Url } from "../lib/s3.js";
import { logger } from "../utils/logger.util.js";

const execFileAsync = promisify(execFile);
const THUMB_TIMEOUT_MS = 30000;

/**
 * Extracts a thumbnail (first frame) from a video via ffmpeg.
 * Reads from a presigned URL so the whole file isn't downloaded.
 * Returns the S3 key of the uploaded thumbnail, or null on any failure.
 * Never throws — thumbnails are enhancement, not a blocker.
 */
export async function generateVideoThumbnail(
  videoUrl: string,
  userId: string
): Promise<string | null> {
  const tmpPath = join(tmpdir(), `thumb-${randomUUID()}.jpg`);
  try {
    await execFileAsync(
      "ffmpeg",
      [
        "-y",
        "-ss", "1",
        "-i", videoUrl,
        "-vframes", "1",
        "-vf", "scale=640:-1",
        "-q:v", "4",
        tmpPath,
      ],
      { timeout: THUMB_TIMEOUT_MS }
    );

    const { readFile } = await import("fs/promises");
    const buffer = await readFile(tmpPath);
    const key = `users/${userId}/thumbnails/${randomUUID()}.jpg`;
    await uploadToS3(key, buffer, "image/jpeg");
    return key;
  } catch (err) {
    logger.warn({ err }, "Video thumbnail generation failed");
    return null;
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}

/**
 * Resolves a media item's thumbnail to a fetchable URL.
 */
export async function resolveThumbnailUrl(thumbnailKey?: string): Promise<string | null> {
  if (!thumbnailKey) return null;
  try {
    return await getS3Url(thumbnailKey);
  } catch {
    return null;
  }
}
