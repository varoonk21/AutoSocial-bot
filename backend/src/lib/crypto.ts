import crypto from "node:crypto";
import env from "../config/env.config.js";

const ALGORITHM = "aes-256-gcm";
const KEY = Buffer.from(env.TOKEN_ENCRYPTION_KEY, "hex");

/**
 * Encrypts an OAuth token for storage. Output format: `v1:<iv hex>:<ciphertext hex>:<authTag hex>`.
 * AES-256-GCM gives us confidentiality + integrity; a tampered value fails closed on decrypt.
 */
export function encryptToken(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `v1:${iv.toString("hex")}:${ciphertext.toString("hex")}:${authTag.toString("hex")}`;
}

/**
 * Decrypts a value produced by encryptToken. Throws if the value was tampered
 * with or the key is wrong — callers must treat this as "reconnect required".
 */
export function decryptToken(encrypted: string): string {
  const [version, ivHex, ciphertextHex, tagHex] = encrypted.split(":");
  if (version !== "v1" || !ivHex || !ciphertextHex || !tagHex) {
    throw new Error("Unrecognized token format");
  }
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return decipher.update(Buffer.from(ciphertextHex, "hex"), undefined, "utf8") + decipher.final("utf8");
}

/** Returns true for values produced by encryptToken (used to avoid double-encrypting). */
export function isEncrypted(value: string): boolean {
  return value.startsWith("v1:");
}

/**
 * Decrypts a stored token, tolerating legacy plaintext values written before
 * encryption was introduced. New writes are always encrypted, so plaintext
 * entries disappear as integrations are reconnected/refreshed.
 */
export function decryptStoredToken(stored: string): string {
  if (!stored) return stored;
  return isEncrypted(stored) ? decryptToken(stored) : stored;
}

/**
 * Cryptographically secure OAuth `state` / temp-state token.
 * Replaces the old Math.random-based makeId() — 256 bits from the OS CSPRNG.
 */
export function generateOAuthState(): string {
  return crypto.randomBytes(32).toString("hex");
}
