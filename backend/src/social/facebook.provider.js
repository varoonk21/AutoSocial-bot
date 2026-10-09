/**
 * FacebookProvider - Full OAuth + publishing implementation for Facebook Pages.
 *
 * Extracted and simplified from:
 *   libraries/nestjs-libraries/src/integrations/social/facebook.provider.ts
 *
 * What's preserved:
 *   - Full OAuth flow (generateAuthUrl, authenticate, refreshToken)
 *   - Page listing (isBetweenSteps flow where user picks a Page)
 *   - Page information fetching via Business Manager API
 *   - Non-story posts: text, photo carousel, video (Reels)
 *   - Story posts: video + photo stories
 *   - Thread comments
 *   - Comprehensive platform-specific error handling
 *
 * What's removed:
 *   - Analytics methods (not needed for core posting)
 *   - Temporal-specific error types (replaced with plain JS errors)
 *   - SSRF-safe dispatcher (replaced with standard fetch)
 *   - NestJS decorators (@Rules, @Injectable)
 *   - DribbbleDto import (unused in this file's main logic)
 *
 * Required env vars:
 *   FACEBOOK_APP_ID       - Your Facebook App ID
 *   FACEBOOK_APP_SECRET   - Your Facebook App Secret
 *   FRONTEND_URL          - Your app's frontend URL (used as OAuth redirect base)
 *
 * OAuth Scopes required:
 *   pages_show_list, business_management, pages_manage_posts,
 *   pages_manage_engagement, pages_read_engagement, read_insights
 */

import { SocialProvider, RefreshTokenError, BadBodyError } from './base/SocialProvider.js';
import { makeId } from '../utils/makeId.js';
import { generateOAuthState } from '../lib/crypto.js';
import { timer } from '../utils/timer.js';
import { hasExtension } from '../utils/hasExtension.js';
import { logger } from '../utils/logger.util.js';
import dayjs from 'dayjs';

// Characters limit for text background presets
const FACEBOOK_PRESET_MAX_CHARS = 130;

class FacebookProvider extends SocialProvider {
  constructor() {
    super();
    this.identifier = 'facebook';
    this.name = 'Facebook Page';
    this.isBetweenSteps = true; // User must pick a Page after OAuth
    this.scopes = [
      'pages_show_list',
      'business_management',
      'pages_manage_posts',
      'pages_manage_engagement',
      'pages_read_engagement',
      'read_insights',
    ];
    this.editor = 'normal';
  }

  maxLength() {
    return 63206;
  }

  // ─── Error Handling ─────────────────────────────────────────────────────────

  /**
   * Maps Facebook Graph API error codes to typed errors.
   * Source: facebook.provider.ts → handleErrors()
   */
  handleErrors(body, status) {
    if (body.indexOf('Error validating access token') > -1) {
      return { type: 'refresh-token', value: 'Please re-authenticate your Facebook account' };
    }
    if (body.indexOf('REVOKED_ACCESS_TOKEN') > -1) {
      return { type: 'refresh-token', value: 'Access token has been revoked, please re-authenticate' };
    }
    if (body.indexOf('1366046') > -1) {
      return { type: 'bad-body', value: 'Photos should be smaller than 4 MB and saved as JPG, PNG' };
    }
    if (body.indexOf('1390008') > -1) {
      return { type: 'bad-body', value: 'You are posting too fast, please slow down' };
    }
    if (body.indexOf('1346003') > -1) {
      return { type: 'bad-body', value: 'Content flagged as abusive by Facebook' };
    }
    if (body.indexOf('1404006') > -1) {
      return { type: 'bad-body', value: 'A security check in Facebook is required to proceed' };
    }
    if (body.indexOf('2069019') > -1) {
      return { type: 'bad-body', value: 'Invalid file' };
    }
    if (body.indexOf('1404102') > -1) {
      return { type: 'bad-body', value: 'Content violates Facebook Community Standards' };
    }
    if (body.indexOf('1404078') > -1) {
      return { type: 'refresh-token', value: 'Page publishing authorization required, please re-authenticate' };
    }
    if (body.indexOf('1366051') > -1) {
      return { type: 'bad-body', value: 'These photos were already posted' };
    }
    if (body.indexOf('1609008') > -1) {
      return { type: 'bad-body', value: 'Cannot post Facebook.com links' };
    }
    if (body.indexOf('2061006') > -1) {
      return { type: 'bad-body', value: 'Invalid URL format in post content' };
    }
    if (body.indexOf('1404112') > -1) {
      return { type: 'bad-body', value: 'Your account has limited access for security reasons' };
    }
    if (body.indexOf('Name parameter too long') > -1) {
      return { type: 'bad-body', value: 'Post content is too long' };
    }
    if (body.indexOf('4854002') > -1) {
      return { type: 'bad-body', value: 'Confirm your identity before publishing as this Page' };
    }
    if (body.indexOf('(#100) No permission to publish the video') > -1) {
      return { type: 'bad-body', value: 'No permission to publish the video' };
    }
    if (body.indexOf('490') > -1) {
      return { type: 'refresh-token', value: 'Access token expired, please re-authenticate' };
    }
    return undefined;
  }

  // ─── Token that never expires (long-lived) ──────────────────────────────────

  async refreshToken(refresh_token) {
    // Facebook Page tokens obtained via the long-lived exchange don't expire
    // for ~60 days. When they do, the user must re-authenticate.
    // Return empty to signal that no automatic refresh is possible.
    return { refreshToken: '', expiresIn: 0, accessToken: '', id: '', name: '', picture: '', username: '' };
  }

  // ─── OAuth Flow ─────────────────────────────────────────────────────────────

  /**
   * Step 1: Generate the OAuth authorization URL.
   * Redirect the user's browser to the returned `url`.
   *
   * Source: facebook.provider.ts → generateAuthUrl()
   */
  async generateAuthUrl() {
    const state = generateOAuthState();
    const url =
      'https://www.facebook.com/v21.0/dialog/oauth' +
      `?client_id=${process.env.FACEBOOK_APP_ID}` +
      `&redirect_uri=${encodeURIComponent(`${process.env.FRONTEND_URL}/integrations/social/facebook`)}` +
      `&state=${state}` +
      `&scope=${this.scopes.join(',')}`;

    return {
      url,
      codeVerifier: makeId(10), // Facebook doesn't use PKCE; we store this for state tracking
      state,
    };
  }

  /**
   * Step 2: Exchange the authorization code for an access token.
   * Called in the OAuth callback route.
   *
   * Source: facebook.provider.ts → authenticate()
   */
  async authenticate({ code, codeVerifier, refresh }) {
    // Exchange code for short-lived token
    const { access_token: shortToken } = await (
      await fetch(
        'https://graph.facebook.com/v21.0/oauth/access_token' +
          `?client_id=${process.env.FACEBOOK_APP_ID}` +
          `&redirect_uri=${encodeURIComponent(
            `${process.env.FRONTEND_URL}/integrations/social/facebook${refresh ? `?refresh=${refresh}` : ''}`
          )}` +
          `&client_secret=${process.env.FACEBOOK_APP_SECRET}` +
          `&code=${code}`
      )
    ).json();

    // Exchange for long-lived token (~60 days)
    const { access_token } = await (
      await fetch(
        'https://graph.facebook.com/v21.0/oauth/access_token' +
          '?grant_type=fb_exchange_token' +
          `&client_id=${process.env.FACEBOOK_APP_ID}` +
          `&client_secret=${process.env.FACEBOOK_APP_SECRET}` +
          `&fb_exchange_token=${shortToken}&fields=access_token,expires_in`
      )
    ).json();

    // Verify all required scopes were granted
    const { data } = await (
      await fetch(`https://graph.facebook.com/v21.0/me/permissions?access_token=${access_token}`)
    ).json();

    const permissions = data.filter((d) => d.status === 'granted').map((p) => p.permission);
    this.checkScopes(this.scopes, permissions);

    // Get basic user info (name, picture)
    const { id, name, picture } = await (
      await fetch(`https://graph.facebook.com/v21.0/me?fields=id,name,picture&access_token=${access_token}`)
    ).json();

    return {
      id,
      name,
      accessToken: access_token,
      refreshToken: access_token, // Facebook uses same token for both
      expiresIn: dayjs().add(59, 'days').unix() - dayjs().unix(),
      picture: picture?.data?.url || '',
      username: '',
    };
  }

  /**
   * Re-connect an existing integration by refreshing the page-specific token.
   * Called when the user re-authenticates an already-connected Page.
   *
   * Source: facebook.provider.ts → reConnect()
   */
  async reConnect(id, requiredId, accessToken) {
    const information = await this.fetchPageInformation(accessToken, { page: requiredId });
    return {
      id: information.id,
      name: information.name,
      accessToken: information.access_token,
      picture: information.picture,
      username: information.username,
    };
  }

  // ─── Page Selection (isBetweenSteps flow) ───────────────────────────────────

  /**
   * Returns all Facebook Pages the user has access to.
   * After OAuth, the frontend calls this and the user picks which Page to post from.
   *
   * Source: facebook.provider.ts → pages()
   */
  async pages(accessToken) {
    const seenIds = new Set();
    const allPages = [];

    const fetchPaginated = async (startUrl) => {
      let nextUrl = startUrl;
      while (nextUrl) {
        const response = await (await fetch(nextUrl)).json();
        if (response.data) {
          for (const page of response.data) {
            if (!seenIds.has(page.id)) {
              seenIds.add(page.id);
              allPages.push(page);
            }
          }
        }
        nextUrl = response.paging?.next;
      }
    };

    // Fetch pages the user explicitly shared during OAuth
    await fetchPaginated(
      `https://graph.facebook.com/v21.0/me/accounts?fields=id,username,name,access_token,picture.type(large)&limit=100&access_token=${accessToken}`
    );

    // Also fetch pages via Business Manager (discovers pages not selected in OAuth dialog)
    try {
      let bizUrl = `https://graph.facebook.com/v21.0/me/businesses?access_token=${accessToken}`;
      while (bizUrl) {
        const bizResponse = await (await fetch(bizUrl)).json();
        if (bizResponse.data) {
          for (const business of bizResponse.data) {
            try {
              await fetchPaginated(
                `https://graph.facebook.com/v21.0/${business.id}/owned_pages?fields=id,username,name,access_token,picture.type(large)&limit=100&access_token=${accessToken}`
              );
            } catch { /* Continue */ }
            try {
              await fetchPaginated(
                `https://graph.facebook.com/v21.0/${business.id}/client_pages?fields=id,username,name,access_token,picture.type(large)&limit=100&access_token=${accessToken}`
              );
            } catch { /* Continue */ }
          }
        }
        bizUrl = bizResponse.paging?.next;
      }
    } catch { /* Business Manager API not available for all users */ }

    return allPages;
  }

  /**
   * Fetches the page-specific access token for a given Page ID.
   * This token is what you store and use to post on behalf of the Page.
   *
   * Source: facebook.provider.ts → fetchPageInformation()
   */
  async fetchPageInformation(accessToken, data) {
    const pageId = data.id;
    const fields = 'id,username,name,access_token,picture.type(large)';

    const searchPaginated = async (startUrl) => {
      let url = startUrl;
      while (url) {
        const response = await (await fetch(url)).json();
        if (response.data) {
          const page = response.data.find((p) => String(p.id) === String(pageId));
          if (page) {
            return {
              id: page.id,
              name: page.name,
              access_token: page.access_token,
              picture: page.picture?.data?.url || '',
              username: page.username,
            };
          }
        }
        url = response.paging?.next;
      }
      return null;
    };

    const fromAccounts = await searchPaginated(
      `https://graph.facebook.com/v21.0/me/accounts?fields=${fields}&limit=100&access_token=${accessToken}`
    );
    if (fromAccounts) return fromAccounts;

    // Check Business Manager
    try {
      let bizUrl = `https://graph.facebook.com/v21.0/me/businesses?access_token=${accessToken}`;
      while (bizUrl) {
        const bizResponse = await (await fetch(bizUrl)).json();
        if (bizResponse.data) {
          for (const business of bizResponse.data) {
            try {
              const fromOwned = await searchPaginated(
                `https://graph.facebook.com/v21.0/${business.id}/owned_pages?fields=${fields}&limit=100&access_token=${accessToken}`
              );
              if (fromOwned) return fromOwned;
            } catch { /* Continue */ }
            try {
              const fromClient = await searchPaginated(
                `https://graph.facebook.com/v21.0/${business.id}/client_pages?fields=${fields}&limit=100&access_token=${accessToken}`
              );
              if (fromClient) return fromClient;
            } catch { /* Continue */ }
          }
        }
        bizUrl = bizResponse.paging?.next;
      }
    } catch { /* Business Manager API not available */ }

    throw new Error('Page not found in your accounts');
  }

  // ─── Publishing ──────────────────────────────────────────────────────────────

  /**
   * Main publish entry point. Handles all post types.
   *
   * Source: facebook.provider.ts → post() + postNonStory()
   *
   * @param {string} id          - Facebook Page ID (stored in integration.internalId)
   * @param {string} accessToken - Page access token (stored in integration.token)
   * @param {PostDetails[]} postDetails
   * @param {object} integration
   */
  async post(id, accessToken, postDetails, integration) {
    const [firstPost] = postDetails;
    const isStory = firstPost?.settings?.post_type === 'story';

    if (isStory) {
      return this._publishStories(id, accessToken, firstPost, integration);
    }

    return this._publishNonStory(id, accessToken, postDetails);
  }

  /**
   * Publishes a non-story post (text, photos carousel, or video/Reel).
   *
   * Source: facebook.provider.ts → postNonStory()
   */
  async _publishNonStory(id, accessToken, postDetails) {
    const [firstPost] = postDetails;

    let finalId = '';
    let finalUrl = '';

    if (hasExtension(firstPost?.media?.[0]?.path, 'mp4')) {
      // Video / Reel post
      const { id: videoId, permalink_url } = await (
        await this.fetch(
          `https://graph.facebook.com/v21.0/${id}/videos?access_token=${accessToken}&fields=id,permalink_url`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              file_url: firstPost.media[0].path,
              description: firstPost.message,
              published: true,
            }),
          },
          'upload mp4'
        )
      ).json();

      finalUrl = 'https://www.facebook.com/reel/' + videoId;
      finalId = videoId;
    } else {
      // Photo carousel or text-only post

      // Upload photos (unpublished) first, then attach to feed post
      const uploadPhotos = !firstPost?.media?.length
        ? []
        : await Promise.all(
            firstPost.media.map(async (media) => {
              const { id: photoId } = await (
                await this.fetch(
                  `https://graph.facebook.com/v21.0/${id}/photos?access_token=${accessToken}`,
                  {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: media.path, published: false }),
                  },
                  'upload photo'
                )
              ).json();
              return { media_fbid: photoId };
            })
          );

      // Background presets only apply to short text-only posts
      const presetId =
        !uploadPhotos?.length &&
        firstPost?.settings?.text_format_preset_id &&
        (firstPost.message?.length || 0) <= FACEBOOK_PRESET_MAX_CHARS
          ? firstPost.settings.text_format_preset_id
          : undefined;

      const publishFeed = async (withPreset) =>
        (
          await this.fetch(
            `https://graph.facebook.com/v21.0/${id}/feed?access_token=${accessToken}&fields=id,permalink_url`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ...(uploadPhotos?.length ? { attached_media: uploadPhotos } : {}),
                ...(firstPost?.settings?.url ? { link: firstPost.settings.url } : {}),
                ...(withPreset && presetId ? { text_format_preset_id: presetId } : {}),
                message: firstPost.message,
                published: true,
              }),
            },
            'publish feed post'
          )
        ).json();

      let feedResult;
      try {
        feedResult = await publishFeed(!!presetId);
      } catch (err) {
        // Retry without preset if the preset caused the failure
        if (!presetId) throw err;
        const detail = `${err?.message ?? ''}`;
        const isPresetError =
          /text_format_preset_id/i.test(detail) ||
          /access token|re-authenticate|revoked/i.test(detail) === false;
        if (!isPresetError) throw err;
        logger.warn('Facebook rejected text_format_preset_id — publishing without it');
        feedResult = await publishFeed(false);
      }

      const { id: postId, permalink_url } = feedResult;
      finalUrl = permalink_url;
      finalId = postId;
    }

    return [
      {
        id: firstPost.id,
        postId: finalId,
        releaseURL: finalUrl,
        status: 'success',
      },
    ];
  }

  /**
   * Publishes Facebook Stories (one per media item).
   * Supports both photo stories and video stories.
   *
   * Source: facebook.provider.ts → postPending/finalizePost (simplified into one sync flow)
   */
  async _publishStories(id, accessToken, firstPost, integration) {
    const results = [];

    for (const media of firstPost?.media || []) {
      if (hasExtension(media.path, 'mp4')) {
        // Video story: start upload → upload file → finish
        const { video_id, upload_url } = await (
          await this.fetch(
            `https://graph.facebook.com/v21.0/${id}/video_stories?upload_phase=start&access_token=${accessToken}`,
            { method: 'POST' },
            'start video story'
          )
        ).json();

        await this.fetch(upload_url, {
          method: 'POST',
          headers: { Authorization: `OAuth ${accessToken}`, file_url: media.path },
        }, 'upload video story');

        // Wait for video to process (poll up to 8 minutes)
        const started = Date.now();
        while (true) {
          if (Date.now() - started > 8 * 60 * 1000) {
            throw new BadBodyError(this.identifier, '{}', 'Video story processing timed out');
          }
          const { status } = await (
            await this.fetch(`https://graph.facebook.com/v21.0/${video_id}?fields=status&access_token=${accessToken}`, {}, 'video status')
          ).json();
          const videoStatus = status?.video_status || 'in_progress';
          if (videoStatus === 'error') throw new BadBodyError(this.identifier, '{}', 'Video processing failed');
          if (videoStatus === 'upload_complete' || videoStatus === 'ready') break;
          await timer(10000);
        }

        const { post_id } = await (
          await this.fetch(
            `https://graph.facebook.com/v21.0/${integration.internalId}/video_stories?upload_phase=finish&video_id=${video_id}&access_token=${accessToken}`,
            { method: 'POST' },
            'finish video story'
          )
        ).json();

        results.push({
          id: firstPost.id,
          postId: post_id,
          releaseURL: `https://www.facebook.com/stories/${post_id}`,
          status: 'success',
        });
      } else {
        // Photo story
        const { id: photoId } = await (
          await this.fetch(
            `https://graph.facebook.com/v21.0/${id}/photos?access_token=${accessToken}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url: media.path, published: false }),
            },
            'upload photo story'
          )
        ).json();

        const { post_id } = await (
          await this.fetch(
            `https://graph.facebook.com/v21.0/${integration.internalId}/photo_stories?photo_id=${photoId}&access_token=${accessToken}`,
            { method: 'POST' },
            'publish photo story'
          )
        ).json();

        results.push({
          id: firstPost.id,
          postId: post_id,
          releaseURL: `https://www.facebook.com/stories/${post_id}`,
          status: 'success',
        });
      }
    }

    return results;
  }

  /**
   * Publishes a comment/reply on a Facebook post.
   *
   * Source: facebook.provider.ts → comment()
   *
   * @param {string} id           - Page ID
   * @param {string} postId       - ID of the original post to comment on
   * @param {string} lastCommentId - ID of the last comment (for reply chains)
   * @param {string} accessToken
   * @param {PostDetails[]} postDetails
   */
  async comment(id, postId, lastCommentId, accessToken, postDetails) {
    const [commentPost] = postDetails;
    const replyToId = lastCommentId || postId;

    const data = await (
      await this.fetch(
        `https://graph.facebook.com/v21.0/${replyToId}/comments?access_token=${accessToken}&fields=id,permalink_url`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...(commentPost.media?.length ? { attachment_url: commentPost.media[0].path } : {}),
            message: commentPost.message,
          }),
        },
        'add comment'
      )
    ).json();

    return [
      {
        id: commentPost.id,
        postId: data.id,
        releaseURL: data.permalink_url,
        status: 'success',
      },
    ];
  }

  /**
   * Page post insights via Graph API. Returns null on any failure
   * (bad token, missing read_insights scope, unsupported post).
   */
  async getPostInsights(postId, accessToken) {
    try {
      const url =
        `https://graph.facebook.com/v21.0/${postId}/insights` +
        `?metric=post_impressions,post_impressions_unique,post_engaged_users` +
        `&access_token=${accessToken}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const json = await res.json();
      const byName = {};
      for (const row of json.data || []) {
        const v = row.values && row.values[0] ? row.values[0].value : 0;
        byName[row.name] = typeof v === 'number' ? v : 0;
      }
      return {
        impressions: byName.post_impressions || 0,
        reach: byName.post_impressions_unique || 0,
        likes: 0,
        comments: 0,
        shares: 0,
        clicks: byName.post_engaged_users || 0,
      };
    } catch {
      return null;
    }
  }
}

export { FacebookProvider };
