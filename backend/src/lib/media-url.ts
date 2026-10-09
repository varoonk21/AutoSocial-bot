import { getS3Url } from "./s3.js";
import awsEnv from "../config/aws.config.js";

/**
 * Extracts our S3 object key from a media path or URL.
 *
 * Media served by GET /media carries a presigned GET URL (or the public
 * S3_PUBLIC_URL) in `path`. Those URLs expire (default 5 minutes), so posts
 * must not store them verbatim — the key is stable and can be re-signed at
 * publish time. All keys issued by the media module live under `users/`,
 * which makes them recognizable inside both public and presigned URLs.
 *
 * Returns null for external URLs (Unsplash, direct links, ...) which are
 * left untouched.
 */
export function extractS3Key(path: string): string | null {
  if (!path || typeof path !== "string") return null;
  const clean = path.split(/[?#]/)[0];

  if (awsEnv.S3_PUBLIC_URL && clean.startsWith(awsEnv.S3_PUBLIC_URL + "/")) {
    const key = clean.slice(awsEnv.S3_PUBLIC_URL.length + 1);
    return key || null;
  }

  const usersIdx = clean.indexOf("/users/");
  if (usersIdx !== -1) return clean.slice(usersIdx + 1) || null;
  if (clean.startsWith("users/")) return clean || null;

  return null;
}

/**
 * Resolves a post media item to a fresh, fetchable URL.
 *
 * Called at publish time: if the media references one of our S3 objects
 * (via `key` or a recognizable S3 URL in `path`), a new presigned GET URL
 * is minted so scheduled posts don't die on expired URLs. External URLs
 * pass through unchanged.
 */
export async function resolveMediaUrl(media: any): Promise<string> {
  const path = typeof media === "string" ? media : media?.path;
  const key = (typeof media === "object" && media?.key) || extractS3Key(path);
  if (key) {
    try {
      return await getS3Url(key);
    } catch {
      // Fall through to the stored path on signing errors.
    }
  }
  return path;
}

/**
 * Normalizes a post media item for storage: always an object with `path`,
 * plus the S3 `key` when the path references one of our objects.
 */
export function normalizeMediaItem(media: any): any {
  if (typeof media === "string") {
    const key = extractS3Key(media);
    return key ? { path: media, key } : { path: media };
  }
  if (media && typeof media === "object") {
    const key = media.key || extractS3Key(media.path);
    return key ? { ...media, key } : { ...media };
  }
  return media;
}
