/**
 * Integrations Controller
 *
 * Handles OAuth flows and connected account management.
 * Extracted from: apps/backend/src/api/routes/integrations.controller.ts
 *
 * OAuth State Storage:
 *   The production system uses Redis. Here we use an in-memory Map with TTL.
 *   This works for single-server deployments. For multi-server, use Redis.
 */

import { Integration } from '../models/index.js';
import { getProvider } from '../services/scheduler.service.js';
import { sendSuccess } from '../utils/response.util.js';
import { logger } from '../utils/logger.util.js';
import { encryptToken, generateOAuthState } from '../lib/crypto.js';

// In-memory OAuth state store (TTL: 10 minutes)
// For production with multiple servers, replace with Redis
const oauthStateStore = new Map();
const STATE_TTL_MS = 10 * 60 * 1000;

function setOAuthState(state, data) {
  oauthStateStore.set(state, { ...data, expiresAt: Date.now() + STATE_TTL_MS });
  logger.info({ state, provider: data.provider, mapSize: oauthStateStore.size }, 'OAuth state stored');
}

function getOAuthState(state) {
  logger.info({ state, mapSize: oauthStateStore.size, keys: [...oauthStateStore.keys()] }, 'OAuth state lookup');
  const entry = oauthStateStore.get(state);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    oauthStateStore.delete(state);
    return null;
  }
  return entry;
}

// Cleanup expired states every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of oauthStateStore.entries()) {
    if (now > value.expiresAt) oauthStateStore.delete(key);
  }
}, 5 * 60 * 1000);

import { toIntegrationDTO, toIntegrationDTOs } from "../dto/integration.dto.js";

// ─── GET /integrations/list ───────────────────────────────────────────────────

async function listIntegrations(req, res) {
  try {
    const integrations = await Integration.find({
      userId: req.user._id,
    });

    sendSuccess(res, { integrations: toIntegrationDTOs(integrations) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ─── GET /integrations/social/:provider ────────────────────────────────────────
// Step 1: Get OAuth URL for a social provider

async function getOAuthUrl(req, res) {
  const { provider } = req.params;
  try {
    const socialProvider = getProvider(provider);

    const { url, codeVerifier, state } = await socialProvider.generateAuthUrl();

    // Store state and codeVerifier in memory for callback validation
    setOAuthState(state, {
      codeVerifier,
      userId: req.user._id.toString(),
      provider,
    });

    sendSuccess(res, { url });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

// ─── GET /integrations/social/:provider/callback ──────────────────────────────
// Step 2: Handle OAuth callback and save tokens

async function oauthCallback(req, res) {
  const { provider } = req.params;
  try {
    const { code, state, oauth_verifier } = req.query;

    const stateData = getOAuthState(state);
    if (!stateData) {
      logger.warn({ provider, state }, 'OAuth callback: invalid or expired state');
      return res.status(400).json({ error: 'Invalid or expired OAuth state. Please try again.' });
    }

    const socialProvider = getProvider(provider);
    oauthStateStore.delete(state); // One-time use

    // Exchange code for tokens
    const authResult = await socialProvider.authenticate({
      code: code || oauth_verifier, // OAuth1 uses oauth_verifier
      codeVerifier: stateData.codeVerifier,
    });

    // For providers that require an extra step (e.g., Facebook Page selection),
    // return a flag so the frontend can show the picker. The access token stays
    // server-side in the state store — it is never sent to the client.
    if (socialProvider.isBetweenSteps) {
      // Save a temporary state for the page selection callback
      const tempState = generateOAuthState();
      setOAuthState(tempState, {
        userId: stateData.userId,
        provider,
        authResult,
      });
      return sendSuccess(res, { inBetweenSteps: true, tempState });
    }

    // Save the integration directly
    const integration = await saveIntegration(stateData.userId, provider, authResult, {});
    sendSuccess(res, { success: true, integration: toIntegrationDTO(integration) });
  } catch (err) {
    logger.error({ err, provider }, 'OAuth callback failed');
    res.status(400).json({ error: err.message });
  }
}

// ─── POST /integrations/social/:provider/page ─────────────────────────────────
// Step 3 (optional): Save selected page/account for providers that need it

async function savePage(req, res) {
  const { provider } = req.params;
  try {
    const { tempState, pageData: pageDataBody } = req.body;

    logger.info({ provider, tempState, pageData: pageDataBody }, 'savePage: received request');

    const stateData = getOAuthState(tempState);
    if (!stateData) {
      logger.warn({ provider, tempState }, 'savePage: invalid or expired state');
      return res.status(400).json({ error: 'Invalid or expired state. Please reconnect.' });
    }

    oauthStateStore.delete(tempState);

    const socialProvider = getProvider(provider);

    // Providers with a page/account picker (facebook, instagram) need the
    // page-specific access token. The frontend posts the raw pages() entry,
    // which for Instagram does NOT include access_token — fetchPageInformation
    // resolves the page token server-side from the user token.
    let authResult;
    if (socialProvider.isBetweenSteps && typeof socialProvider.fetchPageInformation === 'function') {
      const pageData = await socialProvider.fetchPageInformation(
        stateData.authResult.accessToken,
        pageDataBody
      );
      authResult = {
        id: pageData.id,
        name: pageData.name,
        accessToken: pageData.access_token,
        refreshToken: pageData.access_token,
        picture:
          typeof pageData.picture === 'string'
            ? pageData.picture
            : pageData.picture?.data?.url || '',
        username: pageData.username || '',
      };
    } else {
      authResult = {
        id: pageDataBody.id,
        name: pageDataBody.name,
        accessToken: pageDataBody.access_token,
        picture: pageDataBody.picture?.data?.url || '',
        username: pageDataBody.username || '',
      };
    }

    const integration = await saveIntegration(stateData.userId, provider, authResult, {});

    logger.info({ provider, integrationId: integration._id }, 'savePage: integration saved');
    sendSuccess(res, { success: true, integration: toIntegrationDTO(integration) });
  } catch (err) {
    logger.error({ err, provider }, 'savePage failed');
    res.status(400).json({ error: err.message });
  }
}

// ─── GET /integrations/social/:provider/pages ─────────────────────────────────
// Gets list of pages/accounts for providers with isBetweenSteps

async function getPages(req, res) {
  const { provider } = req.params;
  try {
    const { tempState } = req.query;

    logger.info({ provider, tempState }, 'getPages: received request');

    const stateData = getOAuthState(tempState);
    if (!stateData) {
      logger.warn({ provider, tempState }, 'getPages: invalid or expired state');
      return res.status(400).json({ error: 'Invalid or expired state. Please reconnect.' });
    }

    const socialProvider = getProvider(provider);
    const pages = await socialProvider.pages(stateData.authResult.accessToken);

    logger.info({ provider, pageCount: pages.length }, 'getPages: returning pages');
    sendSuccess(res, { pages });
  } catch (err) {
    logger.error({ err, provider }, 'getPages failed');
    res.status(400).json({ error: err.message });
  }
}

// ─── DELETE /integrations/:id ─────────────────────────────────────────────────

async function deleteIntegration(req, res) {
  try {
    await Integration.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    sendSuccess(res, { success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

// ─── PUT /integrations/:id/disable ────────────────────────────────────────────

async function toggleDisable(req, res) {
  try {
    const { disabled } = req.body;
    const integration = await Integration.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { disabled: !!disabled },
      { new: true, runValidators: true }
    ).select('-token -refreshToken');
    sendSuccess(res, { integration: toIntegrationDTO(integration) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

// ─── Helper: Save or Update Integration ───────────────────────────────────────

async function saveIntegration(userId, provider, authResult, extraData = {}) {
  const tokenExpiration = authResult.expiresIn
    ? new Date(Date.now() + authResult.expiresIn * 1000)
    : null;

  // Tokens are encrypted at rest (AES-256-GCM). They are decrypted only in the
  // publish job, and stripped from every API response by the model's toJSON.
  const token = encryptToken(authResult.accessToken);
  const refreshToken = authResult.refreshToken ? encryptToken(authResult.refreshToken) : '';

  const existingIntegration = await Integration.findOne({ userId, internalId: authResult.id });

  if (existingIntegration) {
    return Integration.findByIdAndUpdate(
      existingIntegration._id,
      {
        token,
        refreshToken,
        tokenExpiration,
        name: authResult.name,
        picture: authResult.picture,
        profile: authResult.username,
        refreshNeeded: false,
        ...extraData,
      },
      { new: true, runValidators: true }
    ).select('-token -refreshToken');
  }

  const integration = await Integration.create({
    userId,
    internalId: authResult.id,
    providerIdentifier: provider,
    name: authResult.name,
    picture: authResult.picture || '',
    token,
    refreshToken,
    tokenExpiration,
    profile: authResult.username,
    additionalSettings: JSON.stringify(authResult.additionalSettings || []),
    ...extraData,
  });
  // Re-fetch without the encrypted tokens — create() returns the full document.
  return Integration.findById(integration._id).select('-token -refreshToken');
}

export {
  listIntegrations,
  getOAuthUrl,
  oauthCallback,
  getPages,
  savePage,
  deleteIntegration,
  toggleDisable,
};
