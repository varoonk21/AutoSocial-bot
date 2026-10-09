/**
 * InstagramProvider - Full OAuth + publishing implementation for Instagram Business accounts.
 *
 * Extracted and simplified from:
 *   libraries/nestjs-libraries/src/integrations/social/instagram.provider.ts
 *
 * IMPORTANT: Instagram business publishing requires:
 *   1. A Facebook Developer App with instagram_content_publish permission
 *   2. An Instagram Business or Creator account
 *   3. The Instagram account must be linked to a Facebook Page
 *   4. OAuth goes through Facebook (same App ID/Secret as Facebook provider)
 *
 * What's preserved:
 *   - Full OAuth via Facebook Graph API
 *   - Instagram Business Account selection (isBetweenSteps)
 *   - Image posts (single + carousel up to 10)
 *   - Video Reels
 *   - Stories (photo + video)
 *   - Media container creation + status polling (async publish flow)
 *   - Comprehensive error code mapping
 *
 * What's removed:
 *   - Trial Reels support
 *   - Audio configuration for Reels
 *   - Collaborator tagging
 *   - Temporal pending/checkPostStatus flow (simplified to polling loop)
 *   - Analytics
 *   - NestJS/Temporal decorators
 *
 * Required env vars:
 *   FACEBOOK_APP_ID     - Your Facebook App ID (same as Facebook provider)
 *   FACEBOOK_APP_SECRET - Your Facebook App Secret
 *   FRONTEND_URL        - Your app's frontend URL
 */

import { SocialProvider, BadBodyError } from './base/SocialProvider.js';
import { makeId } from '../utils/makeId.js';
import { generateOAuthState } from '../lib/crypto.js';
import { timer } from '../utils/timer.js';
import { hasExtension } from '../utils/hasExtension.js';
import dayjs from 'dayjs';

class InstagramProvider extends SocialProvider {
  constructor() {
    super();
    this.identifier = 'instagram';
    this.name = 'Instagram (Facebook Business)';
    this.isBetweenSteps = true; // User selects which Instagram account to use
    this.scopes = [
      'instagram_basic',
      'pages_show_list',
      'pages_read_engagement',
      'business_management',
      'instagram_content_publish',
      'instagram_manage_comments',
      'instagram_manage_insights',
    ];
    this.editor = 'normal';
  }

  maxLength() {
    return 2200;
  }

  // ─── Error Handling ─────────────────────────────────────────────────────────

  handleErrors(body, status) {
    if (body.indexOf('REVOKED_ACCESS_TOKEN') > -1 || body.indexOf('"error_subcode":33') > -1) {
      return { type: 'refresh-token', value: 'Something is wrong with your connected user, please re-authenticate' };
    }
    if (body.toLowerCase().indexOf('the user is not an instagram business') > -1) {
      return { type: 'refresh-token', value: 'Your Instagram account must be a Business or Creator account' };
    }
    if (body.toLowerCase().indexOf('session has been invalidated') > -1) {
      return { type: 'refresh-token', value: 'Session invalidated - please re-authenticate and wait 1-2 days before posting again' };
    }
    if (body.indexOf('2207003') > -1) return { type: 'bad-body', value: 'Timeout downloading media, please try again' };
    if (body.indexOf('2207020') > -1) return { type: 'bad-body', value: 'Media expired, please upload again' };
    if (body.indexOf('2207032') > -1) return { type: 'bad-body', value: 'Failed to create media, please try again' };
    if (body.indexOf('2207004') > -1) return { type: 'bad-body', value: 'Image is too large' };
    if (body.indexOf('2207005') > -1) return { type: 'bad-body', value: 'Unsupported image format' };
    if (body.indexOf('2207009') > -1) return { type: 'bad-body', value: 'Aspect ratio not supported (must be 4:5 to 1.91:1)' };
    if (body.indexOf('2207010') > -1) return { type: 'bad-body', value: 'Caption is too long' };
    if (body.indexOf('2207026') > -1) return { type: 'bad-body', value: 'Unsupported video format' };
    if (body.indexOf('2207042') > -1) return { type: 'bad-body', value: 'You have reached the maximum of 25 posts per day' };
    if (body.indexOf('2207051') > -1) return { type: 'bad-body', value: 'Instagram blocked your request' };
    if (body.indexOf('2207001') > -1) return { type: 'bad-body', value: 'Instagram detected spam content, please try again with different content' };
    if (body.indexOf('2207077') > -1) return { type: 'bad-body', value: 'Instagram video download failed' };
    if (body.indexOf('Page request limit reached') > -1) {
      return { type: 'bad-body', value: 'Page posting limit reached for today, please try tomorrow' };
    }
    if (body.indexOf('too little or too many attachments') > -1) {
      return { type: 'bad-body', value: 'Instagram carousel should have between 2 and 10 media attachments' };
    }
    if (body.indexOf('36003') > -1) return { type: 'bad-body', value: 'Aspect ratio not supported (must be 4:5 to 1.91:1)' };
    if (body.indexOf('36001') > -1) return { type: 'bad-body', value: 'Invalid Instagram image resolution, max: 1920x1080px' };
    return undefined;
  }

  async refreshToken() {
    return { refreshToken: '', expiresIn: 0, accessToken: '', id: '', name: '', picture: '', username: '' };
  }

  // ─── OAuth Flow ─────────────────────────────────────────────────────────────

  /**
   * Step 1: Generate Facebook OAuth URL with Instagram permissions.
   * Source: instagram.provider.ts → generateAuthUrl()
   */
  async generateAuthUrl() {
    const state = generateOAuthState();
    const url =
      'https://www.facebook.com/v21.0/dialog/oauth' +
      `?client_id=${process.env.FACEBOOK_APP_ID}` +
      `&redirect_uri=${encodeURIComponent(`${process.env.FRONTEND_URL}/integrations/social/instagram`)}` +
      `&state=${state}` +
      `&scope=${encodeURIComponent(this.scopes.join(','))}`;
    return { url, codeVerifier: makeId(10), state };
  }

  /**
   * Step 2: Exchange code for token.
   * Source: instagram.provider.ts → authenticate()
   */
  async authenticate({ code, codeVerifier, refresh }) {
    const { access_token: shortToken } = await (
      await fetch(
        'https://graph.facebook.com/v21.0/oauth/access_token' +
          `?client_id=${process.env.FACEBOOK_APP_ID}` +
          `&redirect_uri=${encodeURIComponent(
            `${process.env.FRONTEND_URL}/integrations/social/instagram${refresh ? `?refresh=${refresh}` : ''}`
          )}` +
          `&client_secret=${process.env.FACEBOOK_APP_SECRET}` +
          `&code=${code}`
      )
    ).json();

    const { access_token } = await (
      await fetch(
        'https://graph.facebook.com/v21.0/oauth/access_token' +
          '?grant_type=fb_exchange_token' +
          `&client_id=${process.env.FACEBOOK_APP_ID}` +
          `&client_secret=${process.env.FACEBOOK_APP_SECRET}` +
          `&fb_exchange_token=${shortToken}`
      )
    ).json();

    // Verify scopes
    const { data } = await (
      await fetch(`https://graph.facebook.com/v21.0/me/permissions?access_token=${access_token}`)
    ).json();
    const permissions = data.filter((d) => d.status === 'granted').map((p) => p.permission);
    this.checkScopes(this.scopes, permissions);

    const { id, name, picture } = await (
      await fetch(`https://graph.facebook.com/v21.0/me?fields=id,name,picture&access_token=${access_token}`)
    ).json();

    return {
      id,
      name,
      accessToken: access_token,
      refreshToken: access_token,
      expiresIn: dayjs().add(59, 'days').unix() - dayjs().unix(),
      picture: picture?.data?.url || '',
      username: '',
    };
  }

  // ─── Account Selection (isBetweenSteps) ─────────────────────────────────────

  /**
   * Lists all Instagram Business accounts connected to the user's Facebook Pages.
   * Stored token format: "pageAccessToken___userAccessToken"
   *
   * Source: instagram.provider.ts → pages()
   */
  async pages(token) {
    const [accessToken] = token.split('___');
    const seenPageIds = new Set();
    const allFacebookPages = [];

    const fetchPaginated = async (startUrl) => {
      let nextUrl = startUrl;
      while (nextUrl) {
        const response = await (await fetch(nextUrl)).json();
        if (response.data) {
          for (const page of response.data) {
            if (!seenPageIds.has(page.id)) {
              seenPageIds.add(page.id);
              allFacebookPages.push(page);
            }
          }
        }
        nextUrl = response.paging?.next;
      }
    };

    await fetchPaginated(
      `https://graph.facebook.com/v21.0/me/accounts?fields=id,instagram_business_account,username,name,picture.type(large)&limit=100&access_token=${accessToken}`
    );

    try {
      let bizUrl = `https://graph.facebook.com/v21.0/me/businesses?access_token=${accessToken}`;
      while (bizUrl) {
        const bizResponse = await (await fetch(bizUrl)).json();
        if (bizResponse.data) {
          for (const business of bizResponse.data) {
            try {
              await fetchPaginated(
                `https://graph.facebook.com/v21.0/${business.id}/owned_pages?fields=id,instagram_business_account,username,name,picture.type(large)&limit=100&access_token=${accessToken}`
              );
            } catch { /* Continue */ }
            try {
              await fetchPaginated(
                `https://graph.facebook.com/v21.0/${business.id}/client_pages?fields=id,instagram_business_account,username,name,picture.type(large)&limit=100&access_token=${accessToken}`
              );
            } catch { /* Continue */ }
          }
        }
        bizUrl = bizResponse.paging?.next;
      }
    } catch { /* Business Manager not available */ }

    const onlyConnectedAccounts = await Promise.all(
      allFacebookPages
        .filter((f) => f.instagram_business_account)
        .map(async (p) => {
          const igInfo = await (
            await fetch(
              `https://graph.facebook.com/v21.0/${p.instagram_business_account.id}?fields=name,profile_picture_url&access_token=${accessToken}`
            )
          ).json();
          return {
            pageId: p.id,
            id: p.instagram_business_account.id,
            name: igInfo.name,
            picture: { data: { url: igInfo.profile_picture_url } },
          };
        })
    );

    return onlyConnectedAccounts;
  }

  /**
   * Gets the Page-specific token for posting to the Instagram account.
   * Returns token in format: "igPageAccessToken___userAccessToken"
   *
   * Source: instagram.provider.ts → fetchPageInformation()
   */
  async fetchPageInformation(token, data) {
    const [accessToken] = token.split('___');
    const { access_token } = await (
      await fetch(
        `https://graph.facebook.com/v21.0/${data.pageId}?fields=access_token,name,picture.type(large)&access_token=${accessToken}`
      )
    ).json();

    const { id, name, profile_picture_url, username } = await (
      await fetch(
        `https://graph.facebook.com/v21.0/${data.id}?fields=username,name,profile_picture_url&access_token=${accessToken}`
      )
    ).json();

    return {
      id,
      name,
      picture: profile_picture_url,
      access_token: access_token + '___' + accessToken,
      username,
    };
  }

  // ─── Publishing ──────────────────────────────────────────────────────────────

  /**
   * Main publish entry point for Instagram.
   *
   * Instagram publishing is a two-step async process:
   *   1. Create a media container → get a container ID
   *   2. Poll container until FINISHED processing
   *   3. Call media_publish with the container ID
   *
   * Source: instagram.provider.ts → postPending() + checkPostStatus() + finalizePost()
   * (simplified into a single synchronous flow with polling)
   */
  async post(id, token, postDetails, integration) {
    const [accessToken] = token.split('___');
    const [firstPost] = postDetails;
    const isStory = firstPost.settings.post_type === 'story';

    // Step 1: Create media containers for each attachment
    const containers = await Promise.all(
      (firstPost?.media || []).map(async (m) => {
        const caption =
          firstPost.media?.length === 1
            ? `&caption=${encodeURIComponent(firstPost.message)}`
            : '';

        const isCarousel =
          (firstPost?.media?.length || 0) > 1 && !isStory ? '&is_carousel_item=true' : '';

        let mediaType;
        if (hasExtension(m.path, 'mp4')) {
          if (firstPost?.media?.length === 1) {
            mediaType = isStory
              ? `video_url=${m.path}&media_type=STORIES`
              : `video_url=${m.path}&media_type=REELS&thumb_offset=${m?.thumbnailTimestamp || 0}`;
          } else {
            mediaType = isStory
              ? `video_url=${m.path}&media_type=STORIES`
              : `video_url=${m.path}&media_type=VIDEO&thumb_offset=${m?.thumbnailTimestamp || 0}`;
          }
        } else {
          mediaType = isStory ? `image_url=${m.path}&media_type=STORIES` : `image_url=${m.path}`;
        }

        const { id: containerId } = await (
          await this.fetch(
            `https://graph.facebook.com/v21.0/${id}/media?${mediaType}${isCarousel}&access_token=${accessToken}${caption}`,
            { method: 'POST' }
          )
        ).json();

        return containerId;
      })
    );

    // Step 2: Wait for all containers to finish processing
    const postType =
      isStory && containers.length > 1
        ? 'stories'
        : containers.length === 1
        ? 'single'
        : 'carousel';

    if (postType === 'stories') {
      // Stories are published one at a time
      const results = [];
      for (const containerId of containers) {
        await this._waitForContainer(containerId, accessToken);
        const { id: mediaId } = await (
          await this.fetch(
            `https://graph.facebook.com/v21.0/${id}/media_publish?creation_id=${containerId}&access_token=${accessToken}`,
            { method: 'POST' }
          )
        ).json();
        const permalink = await this._getPermalink(mediaId, accessToken, integration);
        results.push({ id: firstPost.id, postId: mediaId, releaseURL: permalink, status: 'success' });
      }
      return results;
    }

    let publishContainerId = containers[0];

    if (postType === 'carousel') {
      // Wait for all carousel children, then create carousel container
      for (const containerId of containers) {
        await this._waitForContainer(containerId, accessToken);
      }
      const { id: carouselId } = await (
        await this.fetch(
          `https://graph.facebook.com/v21.0/${id}/media?media_type=CAROUSEL&children=${containers.join(',')}&caption=${encodeURIComponent(firstPost.message)}&access_token=${accessToken}`,
          { method: 'POST' }
        )
      ).json();
      await this._waitForContainer(carouselId, accessToken);
      publishContainerId = carouselId;
    } else {
      // Single image or video
      await this._waitForContainer(publishContainerId, accessToken);
    }

    // Step 3: Publish the container
    const { id: mediaId } = await (
      await this.fetch(
        `https://graph.facebook.com/v21.0/${id}/media_publish?creation_id=${publishContainerId}&access_token=${accessToken}`,
        { method: 'POST' }
      )
    ).json();

    const permalink = await this._getPermalink(mediaId, accessToken, integration);

    return [{ id: firstPost.id, postId: mediaId, releaseURL: permalink, status: 'success' }];
  }

  /**
   * Polls a media container until it's ready for publishing.
   * Source: instagram.provider.ts → igContainerStatus() (inline polling loop)
   */
  async _waitForContainer(containerId, accessToken, maxWaitMs = 8 * 60 * 1000) {
    const started = Date.now();
    while (true) {
      if (Date.now() - started > maxWaitMs) {
        throw new BadBodyError(this.identifier, '{}', 'Instagram media container timed out during processing');
      }
      const { status_code, status } = await (
        await this.fetch(
          `https://graph.facebook.com/v21.0/${containerId}?access_token=${accessToken}&fields=status_code,status`,
          undefined, '', 0, true
        )
      ).json();

      if (status_code === 'ERROR' || status_code === 'EXPIRED') {
        throw new BadBodyError(this.identifier, JSON.stringify({ status_code, status }), status || 'Instagram could not process the media');
      }
      if (status_code === 'FINISHED' || status_code === 'PUBLISHED') return;
      await timer(5000);
    }
  }

  /**
   * Fetches the post permalink after publishing. Never throws (post is already live).
   */
  async _getPermalink(mediaId, accessToken, integration) {
    try {
      const { permalink } = await (
        await this.fetch(`https://graph.facebook.com/v21.0/${mediaId}?fields=permalink&access_token=${accessToken}`)
      ).json();
      return permalink;
    } catch {
      return `https://www.instagram.com/${integration.profile}`;
    }
  }

  /**
   * Publish a comment/reply on an existing Instagram post.
   * Source: instagram.provider.ts → comment()
   */
  async comment(id, postId, lastCommentId, token, postDetails, integration) {
    const [accessToken] = token.split('___');
    const [commentPost] = postDetails;
    const replyToId = lastCommentId || postId;

    const { id: commentId } = await (
      await this.fetch(
        `https://graph.facebook.com/v21.0/${replyToId}/replies?message=${encodeURIComponent(commentPost.message)}&access_token=${accessToken}`,
        { method: 'POST' }
      )
    ).json();

    return [{ id: commentPost.id, postId: commentId, releaseURL: `https://www.instagram.com/${integration.profile}`, status: 'success' }];
  }

  /**
   * IG media insights via Graph API. Returns null on any failure.
   */
  async getPostInsights(postId, accessToken) {
    try {
      const url =
        `https://graph.facebook.com/v21.0/${postId}/insights` +
        `?metric=impressions,reach,likes,comments,shares,saved` +
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
        impressions: byName.impressions || 0,
        reach: byName.reach || 0,
        likes: byName.likes || 0,
        comments: byName.comments || 0,
        shares: (byName.shares || 0) + (byName.saved || 0),
        clicks: 0,
      };
    } catch {
      return null;
    }
  }
}

export { InstagramProvider };
