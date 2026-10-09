/**
 * Generates a random alphanumeric string of the given length.
 * Extracted from: libraries/nestjs-libraries/src/services/make.is.ts
 */
export function makeId(length = 8) {
  let result = '';
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

