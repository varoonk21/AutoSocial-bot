/**
 * XProvider (Twitter/X) - Full OAuth + publishing implementation.
 *
 * Extracted and simplified from:
 *   libraries/nestjs-libraries/src/integrations/social/x.provider.ts
 *
 * X uses OAuth 1.0a (not 2.0). The twitter-api-v2 npm package handles most of this.
 *
 * What's preserved:
 *   - OAuth 1.0a flow via twitter-api-v2
 *   - Tweet posting (with media, reply_settings, communities)
 *   - Thread posting (reply chains)
 *   - Image upload via twitter-api-v2
 *   - Video upload (chunked, streaming - no full file in memory)
 *   - OAuth1 manual signing for tweet posts (bypasses twitter-api-v2 2.0 endpoint)
 *   - Comprehensive error handling for X-specific codes
 *
 * What's removed:
 *   - Auto-repost plugs
 *   - Auto-plug-post plugs
 *   - Analytics
 *   - NestJS/Temporal decorators
 *   - sharp image resizing (add back if needed for GIF support)
 *
 * Required env vars:
 *   X_API_KEY       - Your X/Twitter API Key (consumer key)
 *   X_API_SECRET    - Your X/Twitter API Secret (consumer secret)
 *   X_URL           - (Optional) Override redirect URL for X OAuth callback
 *   FRONTEND_URL    - Your app's frontend URL
 *
 * npm install: twitter-api-v2 mime-types
 */

import { SocialProvider, BadBodyError } from './base/SocialProvider.js';
import { TwitterApi } from 'twitter-api-v2';
import { createHmac, randomBytes } from 'crypto';
import { lookup } from 'mime-types';
import { createReadStream, statSync } from 'fs';
import { timer } from '../utils/timer.js';
import { hasExtension } from '../utils/hasExtension.js';

class XProvider extends SocialProvider {
  constructor() {
    super();
    this.identifier = 'x';
    this.name = 'X (Twitter)';
    this.isBetweenSteps = false;
    this.scopes = []; // OAuth 1.0a doesn't use scopes in the same way
    this.editor = 'normal';
  }

  /**
   * X character limits:
   * - Standard: 280 chars
   * - Premium (verified): 4000 chars
   */
  maxLength(additionalSettings) {
    const isVerified = Array.isArray(additionalSettings)
      ? !!additionalSettings.find((p) => p?.title === 'Verified')?.value
      : !!additionalSettings;
    return isVerified ? 4000 : 280;
  }

  // ─── Error Handling ─────────────────────────────────────────────────────────

  handleErrors(body) {
    if (body.includes('You are not permitted to perform this action')) {
      return { type: 'bad-body', value: 'Permission denied - check character count and media attachments' };
    }
    if (body.includes('Service Unavailable')) {
      return { type: 'retry', value: 'X is currently unavailable, please try again later' };
    }
    if (body.includes('maximum of one cashtag')) {
      return { type: 'bad-body', value: 'Maximum of one cashtag ($SYMBOL) per post' };
    }
    if (body.includes('maximum of 4 items')) {
      return { type: 'bad-body', value: 'Maximum of 4 media items per post' };
    }
    if (body.includes('Unsupported Authentication')) {
      return { type: 'refresh-token', value: 'X authentication has expired, please reconnect your account' };
    }
    if (body.includes('You are not allowed to create a Tweet')) {
      return { type: 'bad-body', value: 'Not allowed to create duplicate content' };
    }
    if (body.includes('usage-capped')) {
      return { type: 'bad-body', value: 'Posting failed - usage cap reached. Please try again later' };
    }
    if (body.includes('user-suspended')) {
      return { type: 'bad-body', value: 'Your X account has been suspended' };
    }
    if (body.includes('duplicate-rules')) {
      return { type: 'bad-body', value: 'Duplicate post detected, please wait before posting again' };
    }
    if (body.includes('The Tweet contains an invalid URL')) {
      return { type: 'bad-body', value: 'Post contains a URL that is not allowed on X' };
    }
    if (body.includes('This user is not allowed to post a video longer than 2 minutes')) {
      return { type: 'bad-body', value: 'Video exceeds the 2-minute limit for this account' };
    }
    return undefined;
  }

  async refreshToken() {
    // OAuth 1.0a tokens don't expire. User must re-authenticate manually.
    return { id: '', name: '', accessToken: '', refreshToken: '', expiresIn: 999999999, picture: '', username: '' };
  }

  // ─── OAuth 1.0a Flow ─────────────────────────────────────────────────────────

  /**
   * Step 1: Generate OAuth 1.0a authorization URL.
   * Stores oauth_token:oauth_token_secret in codeVerifier for callback use.
   *
   * Source: x.provider.ts → generateAuthUrl()
   */
  async generateAuthUrl() {
    const client = new TwitterApi({
      appKey: process.env.X_API_KEY,
      appSecret: process.env.X_API_SECRET,
    });

    const { url, oauth_token, oauth_token_secret } = await client.generateAuthLink(
      (process.env.X_URL || process.env.FRONTEND_URL) + '/integrations/social/x',
      { authAccessType: 'write', linkMode: 'authenticate', forceLogin: false }
    );

    return {
      url,
      codeVerifier: oauth_token + ':' + oauth_token_secret,
      state: oauth_token,
    };
  }

  /**
   * Step 2: Exchange oauth_verifier for access token.
   *
   * Source: x.provider.ts → authenticate()
   *
   * @param {{ code: string, codeVerifier: string }} params
   *   - code: The oauth_verifier from the callback URL query param
   *   - codeVerifier: "oauth_token:oauth_token_secret" from Step 1
   */
  async authenticate({ code, codeVerifier }) {
    const [oauth_token, oauth_token_secret] = codeVerifier.split(':');

    const startingClient = new TwitterApi({
      appKey: process.env.X_API_KEY,
      appSecret: process.env.X_API_SECRET,
      accessToken: oauth_token,
      accessSecret: oauth_token_secret,
    });

    const { accessToken, client, accessSecret } = await startingClient.login(code);

    const { data: { username, verified, profile_image_url, name, id } } = await client.v2.me({
      'user.fields': ['username', 'verified', 'verified_type', 'profile_image_url', 'name'],
    });

    return {
      id: String(id),
      accessToken: accessToken + ':' + accessSecret, // Store as "token:secret"
      name,
      refreshToken: '',
      expiresIn: 999999999,
      picture: profile_image_url || '',
      username,
      additionalSettings: [
        {
          title: 'Verified',
          description: 'Is this a verified/premium account?',
          type: 'checkbox',
          value: verified,
        },
      ],
    };
  }

  // ─── Twitter Client Helper ───────────────────────────────────────────────────

  _getClient(accessToken) {
    const [tokenSplit, secretSplit] = accessToken.split(':');
    return new TwitterApi({
      appKey: process.env.X_API_KEY,
      appSecret: process.env.X_API_SECRET,
      accessToken: tokenSplit,
      accessSecret: secretSplit,
    });
  }

  // ─── OAuth1 Manual Signing ───────────────────────────────────────────────────

  /**
   * Manually signs an OAuth 1.0a request header.
   * Used for the tweet endpoint because twitter-api-v2 v2 POST uses OAuth2.
   *
   * Source: x.provider.ts → signOAuth1()
   */
  _signOAuth1(method, url, accessToken, accessSecret) {
    const pct = (s) =>
      encodeURIComponent(s)
        .replace(/!/g, '%21').replace(/\*/g, '%2A')
        .replace(/'/g, '%27').replace(/\(/g, '%28').replace(/\)/g, '%29');

    const params = {
      oauth_consumer_key: process.env.X_API_KEY,
      oauth_nonce: randomBytes(16).toString('hex'),
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: String(Math.floor(Date.now() / 1000)),
      oauth_token: accessToken,
      oauth_version: '1.0',
    };

    const paramString = Object.keys(params).sort().map((k) => `${pct(k)}=${pct(params[k])}`).join('&');
    const baseString = [method.toUpperCase(), pct(url.split('?')[0]), pct(paramString)].join('&');
    const signingKey = `${pct(process.env.X_API_SECRET)}&${pct(accessSecret)}`;
    params.oauth_signature = createHmac('sha1', signingKey).update(baseString).digest('base64');

    return 'OAuth ' + Object.keys(params).sort().map((k) => `${pct(k)}="${pct(params[k])}"`).join(', ');
  }

  // ─── Media Upload ─────────────────────────────────────────────────────────────

  /**
   * Returns the byte size of a video without loading it entirely in memory.
   * Uses HEAD request for remote URLs, statSync for local files.
   *
   * Source: x.provider.ts → videoSize()
   */
  async _videoSize(path) {
    if (path.indexOf('http') === 0) {
      const head = await this.fetch(path, { method: 'HEAD' }, 'video size');
      const length = head.headers.get('content-length');
      if (!length) throw new BadBodyError(this.identifier, '{}', 'Could not determine video size for X upload');
      return Number(length);
    }
    return statSync(path).size;
  }

  /**
   * Returns a byte range window of a video as a Buffer.
   * Uses Range GET for remote URLs, stream slice for local files.
   *
   * Source: x.provider.ts → videoChunk()
   */
  async _videoChunk(path, start, end) {
    if (path.indexOf('http') === 0) {
      const response = await this.fetch(path, { headers: { Range: `bytes=${start}-${end}` } }, 'video chunk');
      if (response.status !== 206) {
        throw new BadBodyError(this.identifier, '{}', `Media server ignored Range request (${response.status}); must support Range requests for X chunked uploads`);
      }
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

  /**
   * Chunked video upload: INIT → APPEND (1MB chunks) → FINALIZE → wait for processing.
   * Avoids loading the full video into memory.
   *
   * Source: x.provider.ts → uploadVideoChunked()
   */
  async _uploadVideoChunked(client, path) {
    const size = await this._videoSize(path);
    const chunkSize = 1024 * 1024; // 1MB

    // X chunked media upload is v1.1-only (v2 has no media/upload endpoints)
    const initResponse = await client.v1.post('media/upload', {
      command: 'INIT',
      total_bytes: size.toString(),
      media_type: lookup(path) || 'video/mp4',
      media_category: 'tweet_video',
    });
    const mediaId = initResponse.media_id_string;

    for (let i = 0; i < size; i += chunkSize) {
      const end = Math.min(i + chunkSize, size) - 1;
      await client.v1.post('media/upload', {
        command: 'APPEND',
        media_id: mediaId,
        segment_index: (i / chunkSize).toString(),
        media: await this._videoChunk(path, i, end),
      });
    }

    const finalizeResponse = await client.v1.post('media/upload', {
      command: 'FINALIZE',
      media_id: mediaId,
    });
    if (finalizeResponse.processing_info) {
      await this._waitForMediaProcessing(client, mediaId);
    }
    return mediaId;
  }

  /**
   * Polls media processing status until complete.
   * Source: x.provider.ts → waitForMediaProcessing()
   */
  async _waitForMediaProcessing(client, mediaId) {
    const response = await client.v2.get('media/upload', { command: 'STATUS', media_id: mediaId });
    const info = response.data.processing_info;
    if (!info || info.state === 'succeeded') return;
    if (info.state === 'failed') {
      throw new BadBodyError('x-error-upload', JSON.stringify(response.data), `X media processing failed: ${info.error?.message || 'unknown'}`);
    }
    await timer((info.check_after_secs || 1) * 1000);
    await this._waitForMediaProcessing(client, mediaId);
  }

  /**
   * Uploads all media items for the given posts and returns a map of postId → mediaIds[].
   * Source: x.provider.ts → uploadMedia()
   */
  async _uploadMedia(client, postDetails) {
    const results = await Promise.all(
      postDetails.flatMap((p) =>
        (p?.media || []).map(async (m) => {
          const mediaId = hasExtension(m.path, 'mp4')
            ? await this._uploadVideoChunked(client, m.path)
            : await client.v2.uploadMedia(
                await (async () => {
                  const response = await this.fetch(m.path, {}, 'fetch media');
                  return Buffer.from(await response.arrayBuffer());
                })(),
                { media_type: (lookup(m.path) || '') }
              );
          return { id: mediaId, postId: p.id };
        })
      )
    );

    return results.reduce((acc, val) => {
      if (!val?.id) return acc;
      acc[val.postId] = acc[val.postId] || [];
      acc[val.postId].push(val.id);
      return acc;
    }, {});
  }

  // ─── Publishing ──────────────────────────────────────────────────────────────

  /**
   * Publishes a tweet or thread.
   * For threads: first post is the main tweet, subsequent posts are reply-chained.
   *
   * Source: x.provider.ts → post() + comment()
   */
  async post(id, accessToken, postDetails, integration) {
    const [accessTokenSplit, accessSecretSplit] = accessToken.split(':');
    const client = this._getClient(accessToken);
    const [firstPost, ...commentPosts] = postDetails;

    const uploadAll = await this._uploadMedia(client, [firstPost]);
    const media_ids = (uploadAll[firstPost.id] || []).filter(Boolean);

    const tweetUrl = 'https://api.x.com/2/tweets';
    const tweetBody = {
      ...(firstPost?.settings?.who_can_reply_post && firstPost.settings.who_can_reply_post !== 'everyone'
        ? { reply_settings: firstPost.settings.who_can_reply_post }
        : {}),
      ...(firstPost?.settings?.community
        ? { share_with_followers: true, community_id: firstPost.settings.community.split('/').pop() || '' }
        : {}),
      text: firstPost.message,
      ...(media_ids.length ? { media: { media_ids } } : {}),
    };

    const tweetResponse = await this.fetch(tweetUrl, {
      method: 'POST',
      headers: {
        Authorization: this._signOAuth1('POST', tweetUrl, accessTokenSplit, accessSecretSplit),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(tweetBody),
    });
    const { data } = await tweetResponse.json();

    const results = [
      {
        postId: data.id,
        id: firstPost.id,
        releaseURL: `https://twitter.com/${integration.profile}/status/${data.id}`,
        status: 'posted',
      },
    ];

    // Publish thread replies
    let lastTweetId = data.id;
    for (const commentPost of commentPosts) {
      const commentResult = await this.comment(id, lastTweetId, undefined, accessToken, [commentPost], integration);
      lastTweetId = commentResult[0].postId;
      results.push(commentResult[0]);
    }

    return results;
  }

  /**
   * Publishes a reply tweet.
   * Source: x.provider.ts → comment()
   */
  async comment(id, postId, lastCommentId, accessToken, postDetails, integration) {
    const [accessTokenSplit, accessSecretSplit] = accessToken.split(':');
    const client = this._getClient(accessToken);
    const [commentPost] = postDetails;

    const uploadAll = await this._uploadMedia(client, [commentPost]);
    const media_ids = (uploadAll[commentPost.id] || []).filter(Boolean);
    const replyToId = lastCommentId || postId;

    const tweetUrl = 'https://api.x.com/2/tweets';
    const tweetBody = {
      text: commentPost.message,
      ...(media_ids.length ? { media: { media_ids } } : {}),
      reply: { in_reply_to_tweet_id: replyToId },
    };

    const tweetResponse = await this.fetch(tweetUrl, {
      method: 'POST',
      headers: {
        Authorization: this._signOAuth1('POST', tweetUrl, accessTokenSplit, accessSecretSplit),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(tweetBody),
    });
    const { data } = await tweetResponse.json();

    return [
      {
        postId: data.id,
        id: commentPost.id,
        releaseURL: `https://twitter.com/${integration.profile}/status/${data.id}`,
        status: 'posted',
      },
    ];
  }

  /**
   * X tweet public metrics via API v2. Returns null on any failure.
   */
  async getPostInsights(postId, accessToken) {
    try {
      const res = await fetch(
        `https://api.x.com/2/tweets/${postId}?tweet.fields=public_metrics`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!res.ok) return null;
      const json = await res.json();
      const m = (json.data && json.data.public_metrics) || {};
      return {
        impressions: m.impression_count || 0,
        reach: 0,
        likes: m.like_count || 0,
        comments: m.reply_count || 0,
        shares: (m.retweet_count || 0) + (m.quote_count || 0),
        clicks: 0,
      };
    } catch {
      return null;
    }
  }
}

export { XProvider };
