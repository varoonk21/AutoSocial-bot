/**
 * Promise-based delay helper.
 * Extracted from: libraries/helpers/src/utils/timer.ts
 */
export function timer(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
