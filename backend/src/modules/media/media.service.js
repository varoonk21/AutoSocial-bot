import crypto from "crypto";
import { getPresignedUploadUrl, getS3Url, deleteS3Object } from "../../lib/s3.js";
import * as mediaRepository from "./media.repository.js";
import { toSkipTake } from "../../utils/pagination.util.js";
import { AppError } from "../../utils/appError.util.js";

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif"]);
const ALLOWED_VIDEO_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm"]);

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_VIDEO_SIZE = 200 * 1024 * 1024; // 200MB (LinkedIn/IG accept large video files)

// video/quicktime uploads as .mov so providers detect it by extension
const EXTENSION_OVERRIDES = { "video/quicktime": "mov", "video/webm": "webm", "video/mp4": "mp4" };

/**
 * S3 keys are namespaced per user (`users/<userId>/...`). The upload-URL
 * endpoint only issues keys under the caller's prefix, but the metadata
 * endpoint takes a client-supplied key — reject anything outside the caller's
 * own namespace or containing path traversal.
 */
function assertUserScopedKey(userId, key) {
  const prefix = `users/${userId}/`;
  if (typeof key !== "string" || !key.startsWith(prefix) || key.includes("..") || key.includes("\\")) {
    throw new AppError("Invalid media key: must be an upload key issued for your account", 400, "INVALID_MEDIA_KEY");
  }
}

async function getMedia(userId, queryParams) {
  const { page, pageSize, search = "", type = "", source = "", sort } = queryParams;
  const { skip, take: limit } = toSkipTake(page, pageSize);
  
  const query = {
    userId,
    deletedAt: null,
    ...(search ? { originalName: { $regex: search, $options: "i" } } : {}),
    ...(type && type !== "all" ? { type } : {}),
    ...(source && source !== "all" ? { source } : {}),
  };

  const sortParam = sort ? { [sort.field]: sort.direction === "desc" ? -1 : 1 } : { createdAt: -1 };

  const { media, total } = await mediaRepository.findMedia(query, skip, limit, sortParam);

  const mediaWithUrls = await Promise.all(
    media.map(async (m) => {
      const obj = m.toObject();
      obj.path = await getS3Url(m.key);
      if (m.thumbnail) {
        try {
          const { resolveThumbnailUrl } = await import("../services/thumbnail.service.js");
          obj.thumbnailUrl = await resolveThumbnailUrl(m.thumbnail);
        } catch {
          obj.thumbnailUrl = null;
        }
      }
      return obj;
    }),
  );

  return { media: mediaWithUrls, total, limit };
}

async function getUploadUrl(userId, { fileName, contentType, fileSize }) {
  const isVideo = ALLOWED_VIDEO_TYPES.has(contentType);
  if (!ALLOWED_IMAGE_TYPES.has(contentType) && !isVideo) {
    throw new Error(`Unsupported file type: ${contentType}`);
  }

  const maxSize = isVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;
  if (fileSize > maxSize) {
    throw new Error(`File size exceeds ${maxSize / 1024 / 1024}MB limit`);
  }

  const ext = EXTENSION_OVERRIDES[contentType] || contentType.split("/")[1] || "jpg";
  const uniqueId = crypto.randomUUID();
  const folder = isVideo ? "videos" : "images";
  const key = `users/${userId}/${folder}/${uniqueId}.${ext}`;

  const presignedUrl = await getPresignedUploadUrl(key, contentType);

  return { presignedUrl, key };
}

async function saveMediaMetadata(userId, { key, originalName, contentType, fileSize, source = "user" }) {
  // The key is client-supplied: enforce that it lives under this user's own
  // prefix and contains no path traversal. Upload URLs are issued for
  // `users/<userId>/images/<uuid>.<ext>`; anything else is rejected.
  assertUserScopedKey(userId, key);

  const type = contentType.startsWith("video") ? "video" : "image";

  const media = await mediaRepository.createMedia({
    userId,
    name: key.split("/").pop(),
    originalName,
    type,
    source,
    fileSize,
    key,
  });

  // Videos: generate a thumbnail in the background (non-blocking)
  if (type === "video") {
    generateThumbnailInBackground(media._id.toString(), userId, key);
  }

  return media;
}

/**
 * Fire-and-forget thumbnail generation so uploads stay fast.
 */
function generateThumbnailInBackground(mediaId, userId, videoKey) {
  (async () => {
    try {
      const { generateVideoThumbnail } = await import("../services/thumbnail.service.js");
      const { getS3Url } = await import("../lib/s3.js");
      const videoUrl = await getS3Url(videoKey);
      const thumbKey = await generateVideoThumbnail(videoUrl, userId);
      if (thumbKey) {
        await mediaRepository.updateMediaById(mediaId, userId, { thumbnail: thumbKey });
      }
    } catch {
      // thumbnails are best-effort
    }
  })();
}

async function deleteMediaPermanently(userId, mediaId) {
  const media = await mediaRepository.findMediaByIdAndUser(mediaId, userId);
  if (!media) {
    throw new Error("Media not found");
  }

  if (media.key) {
    await deleteS3Object(media.key);
  }

  await mediaRepository.deleteMediaById(mediaId);

  return media;
}

async function renameMedia(userId, mediaId, originalName) {
  const media = await mediaRepository.findMediaByIdAndUser(mediaId, userId);
  if (!media) {
    throw new Error("Media not found");
  }

  const updated = await mediaRepository.updateMediaById(mediaId, userId, { originalName });
  return updated;
}

export { getMedia, getUploadUrl, saveMediaMetadata, deleteMediaPermanently, renameMedia };
