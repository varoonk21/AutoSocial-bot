/**
 * Checks if a file path ends with a given extension.
 * Extracted from: libraries/helpers/src/utils/has.extension.ts
 *
 * Query strings and fragments are stripped first so presigned S3 URLs
 * (https://bucket/key.mp4?X-Amz-...) are detected correctly.
 */
export function hasExtension(path, extension) {
  if (!path || typeof path !== 'string') return false;
  const clean = path.split(/[?#]/)[0];
  return clean.toLowerCase().endsWith('.' + extension.toLowerCase());
}
