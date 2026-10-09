/**
 * SocialProvider - Abstract base class for all social media integrations.
 *
 * Extracted and simplified from:
 *   libraries/nestjs-libraries/src/integrations/social.abstract.ts
 *
 * Removed:
 *   - Temporal ApplicationFailure (replaced with plain Error)
 *   - SSRF-safe dispatcher (replaced with plain fetch)
 *   - sharp image dimension utilities (optional, add back if needed)
 *   - NestJS decorators
 *
 * Error classes:
 *   - RefreshTokenError: Thrown when the access token is expired/revoked.
 *     The scheduler will catch this and mark the integration as needing re-auth.
 *   - BadBodyError: Thrown when the post content/media is rejected by the platform.
 */

import { timer } from '../../utils/timer.js';

// ─── Custom Error Types ───────────────────────────────────────────────────────

class RefreshTokenError extends Error {
  constructor(identifier, responseBody, message = '') {
    super(message || 'Token refresh required');
    this.name = 'RefreshTokenError';
    this.identifier = identifier;
    this.responseBody = responseBody;
    this.type = 'refresh_token';
  }
}

class BadBodyError extends Error {
  constructor(identifier, responseBody, message = '') {
    super(message || 'Bad request body');
    this.name = 'BadBodyError';
    this.identifier = identifier;
    this.responseBody = responseBody;
    this.type = 'bad_body';
  }
}

class NotEnoughScopesError extends Error {
  constructor(message = 'Not enough scopes - please re-authenticate and grant all required permissions') {
    super(message);
    this.name = 'NotEnoughScopesError';
    this.type = 'not_enough_scopes';
  }
}

// ─── Abstract Base Class ─────────────────────────────────────────────────────

class SocialProvider {
  constructor() {
    // Subclasses define these:
    this.identifier = '';  // e.g. 'facebook', 'instagram', 'x', 'linkedin'
    this.name = '';        // e.g. 'Facebook Page'
    this.scopes = [];      // Required OAuth scopes
    this.editor = 'normal'; // 'none' | 'normal' | 'markdown' | 'html'
    this.isBetweenSteps = false; // True if platform requires a page-selection step after OAuth
  }

  // ─── Methods Subclasses Must Implement ───────────────────────────────────

  /**
   * Generates the OAuth authorization URL.
   * @returns {{ url: string, codeVerifier: string, state: string }}
   */
  async generateAuthUrl() {
    throw new Error(`${this.identifier}: generateAuthUrl() not implemented`);
  }

  /**
   * Exchanges the OAuth code for tokens and returns account details.
   * @param {{ code: string, codeVerifier: string, refresh?: string }} params
   * @returns {AuthTokenDetails}
   */
  async authenticate(params) {
    throw new Error(`${this.identifier}: authenticate() not implemented`);
  }

  /**
   * Refreshes an expired access token.
   * @param {string} refreshToken
   * @returns {AuthTokenDetails}
   */
  async refreshToken(refreshToken) {
    throw new Error(`${this.identifier}: refreshToken() not implemented`);
  }

  /**
   * Publishes a post (or thread) to the platform.
   * @param {string} id                - The platform account ID (internalId)
   * @param {string} accessToken       - The platform access token
   * @param {PostDetails[]} postDetails - Array of post objects (first = main, rest = comments/thread)
   * @param {object} integration       - The full integration DB record
   * @returns {PostResponse[]}
   */
  async post(id, accessToken, postDetails, integration) {
    throw new Error(`${this.identifier}: post() not implemented`);
  }

  /**
   * Maximum post character length. Override in subclasses.
   * @param {any} [additionalSettings]
   * @returns {number}
   */
  maxLength(additionalSettings) {
    return 280;
  }

  /**
   * Validate post before publishing. Returns true if valid, or an error string.
   * @param {Array<Array<{path: string, thumbnail?: string}>>} posts
   * @param {any} settings
   * @param {any[]} additionalSettings
   * @returns {Promise<true|string>}
   */
  async checkValidity(posts, settings, additionalSettings) {
    return true;
  }

  // ─── Error Handling ───────────────────────────────────────────────────────

  /**
   * Override in subclasses to map platform-specific error messages to typed errors.
   * @param {string} body   - Response body string
   * @param {number} status - HTTP status code
   * @returns {{ type: 'refresh-token'|'bad-body'|'retry', value: string }|undefined}
   */
  handleErrors(body, status) {
    return undefined;
  }

  /**
   * Fetches engagement metrics for a published post from the platform.
   * Optional: providers implement this when the platform exposes a metrics API.
   * Must never throw — return null when metrics are unavailable (bad token,
   * missing scopes, unsupported post type) so refresh jobs degrade gracefully.
   *
   * @param {string} postId       - The platform-native post ID (Post.postId)
   * @param {string} accessToken  - The platform access token
   * @param {object} integration  - The full integration DB record
   * @returns {Promise<{impressions:number,reach:number,likes:number,comments:number,shares:number,clicks:number}|null>}
   */
  async getPostInsights(postId, accessToken, integration) {
    return null;
  }

  // ─── Scope Validation ─────────────────────────────────────────────────────

  /**
   * Validates that the obtained scopes include all required scopes.
   * Throws NotEnoughScopesError if any are missing.
   * @param {string[]} required
   * @param {string|string[]} got
   */
  checkScopes(required, got) {
    const gotArray = Array.isArray(got)
      ? got
      : decodeURIComponent(got).split(got.includes(',') ? ',' : ' ');

    if (!required.every((scope) => gotArray.includes(scope))) {
      throw new NotEnoughScopesError();
    }
    return true;
  }

  // ─── HTTP Fetch with Retry & Error Handling ───────────────────────────────

  /**
   * Wraps fetch with automatic retry (rate limits/500s), token refresh detection,
   * and provider-specific error mapping.
   *
   * Source: social.abstract.ts → fetch()
   *
   * @param {string} url
   * @param {RequestInit} [options]
   * @param {string} [identifier]   - Used in error details for debugging
   * @param {number} [totalRetries] - Internal retry counter
   * @param {string} [errorMessage] - Accumulated error message
   * @returns {Promise<Response>}
   */
  async fetch(url, options = {}, identifier = '', totalRetries = 0, errorMessage = '') {
    const response = await globalThis.fetch(url, options);

    if (response.status === 200 || response.status === 201) {
      return response;
    }

    let responseText = '{}';
    try {
      responseText = await response.text();
    } catch {
      responseText = '{}';
    }

    // Max retries reached - throw detailed error
    if (totalRetries > 2) {
      throw new BadBodyError(identifier, responseText, errorMessage || 'Request failed after retries');
    }

    const handleError = this.handleErrors(responseText, response.status);

    // Rate limited or server error without a specific handler → retry with backoff
    if (
      response.status === 429 ||
      (response.status === 500 && !handleError) ||
      responseText.includes('rate_limit_exceeded') ||
      responseText.includes('Rate limit')
    ) {
      await timer(5000);
      return this.fetch(url, options, identifier, totalRetries + 1, handleError?.value || 'Unknown Error');
    }

    // Provider explicitly says retry
    if (handleError?.type === 'retry') {
      await timer(5000);
      return this.fetch(url, options, identifier, totalRetries + 1, handleError.value);
    }

    // Token refresh required
    if (
      (response.status === 401 && (handleError?.type === 'refresh-token' || !handleError)) ||
      handleError?.type === 'refresh-token'
    ) {
      throw new RefreshTokenError(identifier, responseText, handleError?.value);
    }

    // Platform-specific error
    throw new BadBodyError(identifier, responseText, handleError?.value || errorMessage || 'Unknown Error');
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Normalizes a setting value that may arrive as a boolean or the string "true"/"false".
   */
  assetBoolean(value) {
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }
    return !!value;
  }
}

// ─── Type Documentation (JSDoc) ──────────────────────────────────────────────

/**
 * @typedef {object} AuthTokenDetails
 * @property {string} id          - Platform account/user ID
 * @property {string} name        - Display name
 * @property {string} accessToken - Access token
 * @property {string} [refreshToken]
 * @property {number} [expiresIn] - Seconds until expiration
 * @property {string} [picture]   - Profile picture URL
 * @property {string} username    - Platform username/handle
 * @property {string} [error]
 */

/**
 * @typedef {object} PostDetails
 * @property {string} id       - Internal DB post ID
 * @property {string} message  - Post text content
 * @property {any} settings    - Platform-specific settings object
 * @property {MediaContent[]} [media]
 */

/**
 * @typedef {object} MediaContent
 * @property {'image'|'video'} type
 * @property {string} path           - URL or local path to media
 * @property {string} [alt]
 * @property {string} [thumbnail]
 * @property {number} [thumbnailTimestamp]
 */

/**
 * @typedef {object} PostResponse
 * @property {string} id         - Internal DB post ID
 * @property {string} postId     - Platform-assigned post ID
 * @property {string} releaseURL - URL to the published post
 * @property {string} status     - 'success' | 'error' | 'pending'
 */

export {
  SocialProvider,
  RefreshTokenError,
  BadBodyError,
  NotEnoughScopesError,
};
