import { z } from 'zod';

const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
];

const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];

const ALLOWED_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES];

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_VIDEO_SIZE = 200 * 1024 * 1024; // 200MB

function maxSizeFor(contentType) {
  return contentType.startsWith('video/') ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;
}

const fileSizeWithinLimit = (val, ctx) => {
  const max = maxSizeFor(val.contentType);
  if (val.fileSize > max) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `File size exceeds ${max / 1024 / 1024}MB limit`,
    });
  }
};

export const uploadUrlSchema = z
  .object({
    fileName: z.string().min(1, 'fileName is required'),
    contentType: z.enum(ALLOWED_TYPES, {
      errorMap: () => ({ message: 'Unsupported file type. Allowed: JPEG, PNG, GIF, WebP, AVIF, MP4, MOV, WebM' }),
    }),
    fileSize: z.number().positive('fileSize must be positive'),
  })
  .superRefine(fileSizeWithinLimit);

export const saveMetadataSchema = z
  .object({
    key: z.string().min(1, 'key is required'),
    originalName: z.string().min(1, 'originalName is required'),
    contentType: z.enum(ALLOWED_TYPES, {
      errorMap: () => ({ message: 'Unsupported file type' }),
    }),
    fileSize: z.number().positive('fileSize must be positive'),
  })
  .superRefine(fileSizeWithinLimit);

export const mediaIdParamSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid media ID'),
});
