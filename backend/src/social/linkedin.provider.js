/**
 * LinkedInProvider - Full OAuth + publishing implementation for LinkedIn.
 *
 * Extracted and simplified from:
 *   libraries/nestjs-libraries/src/integrations/social/linkedin.provider.ts
 *
 * What's preserved:
 *   - Full OAuth 2.0 flow with refresh token support
 *   - Token refresh (LinkedIn tokens expire in 60-90 days)
 *   - Image upload (single shot PUT)
 *   - Video upload (chunked 2MB PUT with finalizeUpload + status polling)
 *   - PDF/document carousel upload
 *   - Personal account posting
 *   - Organization/Company Page posting
 *   - Thread/comment posting
 *   - LinkedIn-specific text formatting (escaping markdown chars, @mentions)
 *   - Comprehensive error handling
 *
 * What's removed:
 *   - Image carousel → PDF conversion (image-to-pdf dependency)
 *   - PostPlug decorators
 *   - Analytics
 *   - NestJS/Temporal decorators
 *   - sharp image processing (add back if needed)
 *
 * Required env vars:
 *   LINKEDIN_CLIENT_ID     - Your LinkedIn App Client ID
 *   LINKEDIN_CLIENT_SECRET - Your LinkedIn App Client Secret
 *   FRONTEND_URL           - Your app's frontend URL
 *
 * npm install: mime-types
 */

import { SocialProvider, BadBodyError } from './base/SocialProvider.js';
import { makeId } from '../utils/makeId.js';
import { generateOAuthState } from '../lib/crypto.js';
import { timer } from '../utils/timer.js';
import { hasExtension } from '../utils/hasExtension.js';
import { lookup } from 'mime-types';
import { statSync, createReadStream } from 'fs';

class LinkedInProvider extends SocialProvider {
  constructor() {
    super();
    this.identifier = 'linkedin';
    this.name = 'LinkedIn';
    this.isBetweenSteps = false;
    this.oneTimeToken = true; // LinkedIn issues refresh tokens
    this.scopes = [
      'openid',
      'profile',
      'w_member_social',
      'rw_organization_admin',
      'w_organization_social',
      'r_organization_social',
    ];
    this.editor = 'normal';
    this.refreshWait = true; // Wait after token refresh before posting
  }

  maxLength() {
    return 3000;
  }

  // ─── Error Handling ─────────────────────────────────────────────────────────

  handleErrors(body) {
    if (body.indexOf('Unable to obtain activity') > -1) {
      return { type: 'retry', value: 'Unable to obtain activity, retrying' };
    }
    if (body.indexOf('resource is forbidden') > -1 || body.indexOf('Service Unavailable') > -1) {
      return { type: 'retry', value: 'Resource temporarily unavailable, retrying' };
    }
    return undefined;
  }

  // ─── Token Refresh ───────────────────────────────────────────────────────────

  /**
   * Refreshes the LinkedIn access token using the refresh token.
   * LinkedIn tokens expire every 60-90 days; refresh tokens last ~1 year.
   *
   * Source: linkedin.provider.ts → refreshToken()
   */
  async refreshToken(refresh_token) {
    const { access_token: accessToken, refresh_token: newRefreshToken, expires_in } = await (
      await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token,
          client_id: process.env.LINKEDIN_CLIENT_ID,
          client_secret: process.env.LINKEDIN_CLIENT_SECRET,
        }),
      })
    ).json();

    const { vanityName } = await (async () => {
      // /v2/me needs the legacy r_basicprofile product, retired for new apps.
      try {
        return await (
          await fetch('https://api.linkedin.com/v2/me', { headers: { Authorization: `Bearer ${accessToken}` } })
        ).json();
      } catch {
        return { vanityName: '' };
      }
    })();

    const { name, sub: id, picture } = await (
      await fetch('https://api.linkedin.com/v2/userinfo', { headers: { Authorization: `Bearer ${accessToken}` } })
    ).json();

    return { id, accessToken, refreshToken: newRefreshToken, expiresIn: expires_in, name, picture: picture || '', username: vanityName };
  }

  // ─── OAuth Flow ─────────────────────────────────────────────────────────────

  /**
   * Step 1: Generate LinkedIn OAuth 2.0 authorization URL.
   * Source: linkedin.provider.ts → generateAuthUrl()
   */
  async generateAuthUrl() {
    const state = generateOAuthState();
    const codeVerifier = makeId(30);
    const url = `https://www.linkedin.com/oauth/v2/authorization?response_type=code` +
      `&client_id=${process.env.LINKEDIN_CLIENT_ID}` +
      `&prompt=none` +
      `&redirect_uri=${encodeURIComponent(`${process.env.FRONTEND_URL}/integrations/social/linkedin`)}` +
      `&state=${state}` +
      `&scope=${encodeURIComponent(this.scopes.join(' '))}`;
    return { url, codeVerifier, state };
  }

  /**
   * Step 2: Exchange authorization code for tokens.
   * Source: linkedin.provider.ts → authenticate()
   */
  async authenticate({ code, codeVerifier, refresh }) {
    const body = new URLSearchParams();
    body.append('grant_type', 'authorization_code');
    body.append('code', code);
    body.append('redirect_uri', `${process.env.FRONTEND_URL}/integrations/social/linkedin${refresh ? `?refresh=${refresh}` : ''}`);
    body.append('client_id', process.env.LINKEDIN_CLIENT_ID);
    body.append('client_secret', process.env.LINKEDIN_CLIENT_SECRET);

    const { access_token: accessToken, expires_in: expiresIn, refresh_token: refreshToken, scope } = await (
      await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      })
    ).json();

    this.checkScopes(this.scopes, scope);

    const { name, sub: id, picture } = await (
      await fetch('https://api.linkedin.com/v2/userinfo', { headers: { Authorization: `Bearer ${accessToken}` } })
    ).json();

    // /v2/me needs the legacy r_basicprofile product, which LinkedIn retired
    // for new apps — vanityName is best-effort and must not fail the connect.
    let vanityName = '';
    try {
      ({ vanityName } = await (
        await fetch('https://api.linkedin.com/v2/me', { headers: { Authorization: `Bearer ${accessToken}` } })
      ).json());
    } catch { /* vanityName stays empty */ }

    return { id, accessToken, refreshToken, expiresIn, name, picture, username: vanityName };
  }

  // ─── Video Helpers ───────────────────────────────────────────────────────────

  async _videoSize(path) {
    if (path.startsWith('http')) {
      const head = await this.fetch(path, { method: 'HEAD' }, 'video size');
      const length = head.headers.get('content-length');
      if (!length) throw new BadBodyError(this.identifier, '{}', 'Could not determine video size for LinkedIn upload');
      return Number(length);
    }
    return statSync(path).size;
  }

  async _videoChunk(path, start, end) {
    if (path.startsWith('http')) {
      const response = await this.fetch(path, { headers: { Range: `bytes=${start}-${end}` } }, 'video chunk');
      if (response.status !== 206) throw new BadBodyError(this.identifier, '{}', `Server ignored Range request (${response.status})`);
      return Buffer.from(await response.arrayBuffer());
    }
    return new Promise((resolve, reject) => {
      const chunks = [];
      createReadStream(path, { start, end })
        .on('data', (c) => chunks.push(c))
        .on('end', () => resolve(Buffer.concat(chunks)))
        .on('error', reject);
    });
  }

  // ─── Media Upload ─────────────────────────────────────────────────────────────

  /**
   * Uploads an image, video, or PDF to LinkedIn and returns the media URN.
   * The URN is then attached to the post payload.
   *
   * Source: linkedin.provider.ts → uploadPicture()
   *
   * @param {string} fileName    - Original filename (used to detect type)
   * @param {string} accessToken
   * @param {string} personId    - LinkedIn person ID or organization ID
   * @param {Buffer|string} picture - File buffer (images/PDFs) or path/URL (videos)
   * @param {'personal'|'company'} type
   */
  async _uploadMedia(fileName, accessToken, personId, picture, type = 'personal') {
    const isVideo = hasExtension(fileName, 'mp4');
    const isPdf = hasExtension(fileName, 'pdf');
    const endpoint = isVideo ? 'videos' : isPdf ? 'documents' : 'images';
    const videoSize = isVideo ? await this._videoSize(picture) : 0;

    const headers = {
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
      'LinkedIn-Version': '202601',
      Authorization: `Bearer ${accessToken}`,
    };

    const { value: { uploadUrl, image, video, document, uploadInstructions } } = await (
      await this.fetch(`https://api.linkedin.com/rest/${endpoint}?action=initializeUpload`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          initializeUploadRequest: {
            owner: type === 'personal' ? `urn:li:person:${personId}` : `urn:li:organization:${personId}`,
            ...(isVideo ? { fileSizeBytes: videoSize, uploadCaptions: false, uploadThumbnail: false } : {}),
          },
        }),
      })
    ).json();

    const sendUrlRequest = uploadInstructions?.[0]?.uploadUrl || uploadUrl;
    const finalOutput = video || image || document;

    if (isVideo) {
      // Chunked 2MB PUT uploads for video
      const etags = [];
      for (let i = 0; i < videoSize; i += 1024 * 1024 * 2) {
        const end = Math.min(i + 1024 * 1024 * 2, videoSize) - 1;
        const upload = await this.fetch(sendUrlRequest, {
          method: 'PUT',
          headers: {
            'X-Restli-Protocol-Version': '2.0.0',
            'LinkedIn-Version': '202601',
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/octet-stream',
          },
          body: await this._videoChunk(picture, i, end),
        }, 'linkedin', 0, true);
        etags.push(upload.headers.get('etag'));
      }

      await this.fetch('https://api.linkedin.com/rest/videos?action=finalizeUpload', {
        method: 'POST',
        body: JSON.stringify({
          finalizeUploadRequest: { video, uploadToken: '', uploadedPartIds: etags },
        }),
        headers: { ...headers, 'Content-Type': 'application/json' },
      });

      await this._waitForMediaReady(video, accessToken, 'videos');
    } else {
      // Single-shot upload for images and PDFs
      await this.fetch(sendUrlRequest, {
        method: 'PUT',
        headers: {
          'X-Restli-Protocol-Version': '2.0.0',
          'LinkedIn-Version': '202601',
          Authorization: `Bearer ${accessToken}`,
          ...(isPdf ? { 'Content-Type': 'application/pdf' } : {}),
        },
        body: picture,
      }, 'linkedin', 0, true);

      if (isPdf && type === 'company') {
        await this._waitForMediaReady(document, accessToken, 'documents');
      } else if (!isPdf && type === 'company') {
        await this._waitForMediaReady(image, accessToken, 'images');
      } else {
        // Personal w_member_social tokens are write-only for images/documents
        await timer(10000);
      }
    }

    return finalOutput;
  }

  /**
   * Polls media status until AVAILABLE.
   * Source: linkedin.provider.ts → waitForMediaToBeReady()
   */
  async _waitForMediaReady(urn, accessToken, type, maxAttempts = 20, intervalMs = 30000) {
    const label = type === 'videos' ? 'video' : type === 'documents' ? 'document' : 'image';
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const json = await (
        await this.fetch(`https://api.linkedin.com/rest/${type}/${encodeURIComponent(urn)}`, {
          method: 'GET',
          headers: {
            'X-Restli-Protocol-Version': '2.0.0',
            'LinkedIn-Version': '202601',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
        })
      ).json();

      if (json.status === 'AVAILABLE') return;
      if (json.status === 'PROCESSING_FAILED') {
        throw new BadBodyError(this.identifier, JSON.stringify(json), `LinkedIn ${label} processing failed${json.processingFailureReason ? `: ${json.processingFailureReason}` : ''}`);
      }
      await timer(intervalMs);
    }
    throw new BadBodyError(this.identifier, '{}', `Timed out waiting for LinkedIn ${label} to be ready`);
  }

  // ─── Text Formatting ─────────────────────────────────────────────────────────

  /**
   * Escapes LinkedIn Markdown special characters and preserves @mention format.
   * Source: linkedin.provider.ts → fixText()
   */
  _fixText(text) {
    const pattern = /@\[.+?]\(urn:li:organization.+?\)/g;
    const matches = text.match(pattern) || [];
    const splitAll = text.split(pattern);
    const escaped = splitAll.map((p) =>
      p
        .replace(/\\/g, '\\\\').replace(/</g, '\\<').replace(/>/g, '\\>')
        .replace(/#/g, '\\#').replace(/~/g, '\\~').replace(/_/g, '\\_')
        .replace(/\|/g, '\\|').replace(/\[/g, '\\[').replace(/]/g, '\\]')
        .replace(/\*/g, '\\*').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
        .replace(/\{/g, '\\{').replace(/}/g, '\\}').replace(/@/g, '\\@')
    );
    return escaped.reduce((all, current) => {
      const match = matches.shift();
      all.push(current);
      if (match) all.push(match);
      return all;
    }, []).join('');
  }

  // ─── Publishing ──────────────────────────────────────────────────────────────

  /**
   * Main publish entry point for LinkedIn.
   * Handles personal and company page posts with text, images, video, and PDF carousel.
   *
   * Source: linkedin.provider.ts → post()
   *
   * @param {string} id          - LinkedIn person/organization ID
   * @param {string} accessToken
   * @param {PostDetails[]} postDetails
   * @param {object} integration - Must include integration.type ('personal'|'company')
   */
  async post(id, accessToken, postDetails, integration) {
    const [firstPost, ...commentPosts] = postDetails;
    const postType = integration.type || 'personal';
    const isPdf = firstPost.settings?.post_as_images_carousel;

    // Upload all media for the main post
    const mediaIds = await Promise.all(
      (firstPost.media || []).map(async (media) => {
        let mediaBuffer;
        if (hasExtension(media.path, 'mp4')) {
          mediaBuffer = media.path; // Videos pass through as path/URL
        } else {
          // Fetch the file for images/PDFs
          const response = await this.fetch(media.path, {}, 'fetch media');
          mediaBuffer = Buffer.from(await response.arrayBuffer());
        }
        return this._uploadMedia(media.path, accessToken, id, mediaBuffer, postType);
      })
    );

    // Determine post content structure
    let content = {};
    if (mediaIds.length === 1) {
      content = {
        content: {
          media: {
            ...(isPdf ? { title: firstPost.settings?.carousel_name || 'slides' } : {}),
            id: mediaIds[0],
          },
        },
      };
    } else if (mediaIds.length > 1) {
      content = { content: { multiImage: { images: mediaIds.map((mid) => ({ id: mid })) } } };
    }

    const author = postType === 'personal' ? `urn:li:person:${id}` : `urn:li:organization:${id}`;

    const postPayload = {
      author,
      commentary: this._fixText(firstPost.message),
      visibility: 'PUBLIC',
      distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
      ...content,
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    };

    const response = await this.fetch('https://api.linkedin.com/rest/posts', {
      method: 'POST',
      headers: {
        'LinkedIn-Version': '202601',
        'X-Restli-Protocol-Version': '2.0.0',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(postPayload),
    });

    if (response.status !== 201 && response.status !== 200) {
      throw new BadBodyError(this.identifier, '{}', 'LinkedIn post creation failed');
    }

    // The post URN is in the Location header
    const postUrn = response.headers.get('x-restli-id') || response.headers.get('location')?.split('/').pop() || '';
    const releaseURL = `https://www.linkedin.com/feed/update/${postUrn}`;

    const results = [{ id: firstPost.id, postId: postUrn, releaseURL, status: 'success' }];

    // Publish thread comments
    for (const commentPost of commentPosts) {
      const commentResult = await this.comment(id, postUrn, undefined, accessToken, [commentPost], integration);
      results.push(commentResult[0]);
    }

    return results;
  }

  /**
   * Publishes a comment on a LinkedIn post.
   * Source: linkedin.provider.ts → comment()
   */
  async comment(id, postId, lastCommentId, accessToken, postDetails, integration) {
    const [commentPost] = postDetails;
    const postType = integration.type || 'personal';
    const author = postType === 'personal' ? `urn:li:person:${id}` : `urn:li:organization:${id}`;

    const commentPayload = {
      actor: author,
      object: postId,
      message: { text: this._fixText(commentPost.message) },
    };

    const response = await this.fetch(
      `https://api.linkedin.com/rest/socialActions/${encodeURIComponent(postId)}/comments`,
      {
        method: 'POST',
        headers: {
          'LinkedIn-Version': '202601',
          'X-Restli-Protocol-Version': '2.0.0',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(commentPayload),
      }
    );

    const commentUrn = response.headers.get('x-restli-id') || '';

    return [
      {
        id: commentPost.id,
        postId: commentUrn,
        releaseURL: `https://www.linkedin.com/feed/update/${postId}`,
        status: 'success',
      },
    ];
  }

  /**
   * LinkedIn engagement via the socialActions API. Best-effort: the stored
   * postId must be a share/post URN; returns null otherwise or on any failure.
   */
  async getPostInsights(postId, accessToken) {
    try {
      if (!postId || !postId.includes('urn:li:')) return null;
      const encoded = encodeURIComponent(postId);
      const headers = { Authorization: `Bearer ${accessToken}` };
      const [likesRes, commentsRes] = await Promise.all([
        fetch(`https://api.linkedin.com/v2/socialActions/${encoded}/likes/summary`, { headers }),
        fetch(`https://api.linkedin.com/v2/socialActions/${encoded}/comments/summary`, { headers }),
      ]);
      if (!likesRes.ok && !commentsRes.ok) return null;
      const likes = likesRes.ok ? await likesRes.json().catch(() => ({})) : {};
      const comments = commentsRes.ok ? await commentsRes.json().catch(() => ({})) : {};
      return {
        impressions: 0,
        reach: 0,
        likes: likes.totalLikes || 0,
        comments: comments.totalFirstLevelComments || 0,
        shares: 0,
        clicks: 0,
      };
    } catch {
      return null;
    }
  }
}

export { LinkedInProvider };
