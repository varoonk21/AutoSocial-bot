import { Agenda, Job } from "agenda";
import { Post, Integration, BrandKit } from "../models/index.js";
import { getProvider } from "../services/scheduler.service.js";
import { notifyUser } from "../services/notification.service.js";
import { applyWatermark } from "../services/watermark.service.js";
import { RefreshTokenError } from "../social/base/SocialProvider.js";
import { timer } from "../utils/timer.js";
import { logger } from "../utils/logger.util.js";
import { encryptToken, decryptStoredToken } from "../lib/crypto.js";
import { resolveMediaUrl, extractS3Key } from "../lib/media-url.js";
import { getS3Url, uploadToS3 } from "../lib/s3.js";

const JOB_NAME = "publish-post";

export interface PublishJobData {
  groupId: string;
}

export function definePublishJob(agenda: Agenda): void {
  agenda.define(
    JOB_NAME,
    async (job: Job<PublishJobData>) => {
      const { groupId } = job.attrs.data;

      logger.info({ groupId }, "Processing publish job");

      const posts = await Post.find({ group: groupId, state: "QUEUE" }).populate("integrationId");

      if (!posts.length) {
        logger.warn({ groupId }, "No queued posts found for group");
        return;
      }

      // Group posts by integration (each integration gets its own publish call)
      const postsByIntegration = new Map<string, any[]>();
      const orphaned: any[] = [];
      for (const post of posts) {
        const integrationId = post.integrationId?._id?.toString() || post.integrationId?.toString();
        if (!integrationId) {
          orphaned.push(post);
          continue;
        }
        if (!postsByIntegration.has(integrationId)) {
          postsByIntegration.set(integrationId, []);
        }
        postsByIntegration.get(integrationId)!.push(post);
      }
      // Posts with no social account must not sit in QUEUE forever
      if (orphaned.length > 0) {
        await markPostsError(orphaned, "No social account selected for this post");
      }

      // Publish each integration's posts independently
      await Promise.allSettled(
        Array.from(postsByIntegration.entries()).map(([integrationId, integrationPosts]) =>
          publishToIntegration(integrationPosts)
        )
      );
    },
    { concurrency: 5, lockLifetime: 120000 }
  );
}

async function publishToIntegration(posts: any[]): Promise<void> {
  const firstPost = posts[0];
  const integration = firstPost.integrationId;

  if (!integration) {
    await markPostsError(posts, "Integration not found");
    return;
  }

  if (integration.disabled) {
    await markPostsError(posts, "This social channel is disabled");
    return;
  }

  // Sort: parent first, then children
  const sorted = posts.sort((a: any, b: any) => {
    if (!a.parentPostId) return -1;
    if (!b.parentPostId) return 1;
    return 0;
  });

  const postDetails = await Promise.all(
    sorted.map(async (p: any) => {
      const rawMedia = JSON.parse(p.image || "[]");
      // Mint fresh presigned URLs for our S3 media: the URL stored at
      // schedule time expires within minutes, so re-sign at publish time.
      const media = await Promise.all(
        rawMedia.map(async (m: any) => ({
          ...(typeof m === "object" && m !== null ? m : {}),
          path: await resolveMediaUrl(m),
        }))
      );
      const settings = JSON.parse(p.settings || "{}");
      return {
        id: p._id.toString(),
        message: p.content,
        settings,
        media,
        _watermark: settings.watermark === true,
        _userId: p.userId?.toString(),
      };
    })
  );

  // Apply brand-kit watermark to opted-in posts (best-effort, never blocks publish)
  await applyWatermarks(postDetails);

  const provider = getProvider(integration.providerIdentifier);

  try {
    // Tokens are stored encrypted at rest — decrypt before use.
    let token = decryptStoredToken(integration.token);
    if (integration.tokenExpiration && new Date(integration.tokenExpiration) <= new Date()) {
      const refreshToken = decryptStoredToken(integration.refreshToken);
      if (refreshToken) {
        try {
          const refreshed = await provider.refreshToken(refreshToken);
          if (refreshed?.accessToken) {
            token = refreshed.accessToken;
            await Integration.findByIdAndUpdate(integration._id, {
              token: encryptToken(refreshed.accessToken),
              refreshToken: refreshed.refreshToken
                ? encryptToken(refreshed.refreshToken)
                : integration.refreshToken, // already encrypted
              tokenExpiration: refreshed.expiresIn
                ? new Date(Date.now() + refreshed.expiresIn * 1000)
                : integration.tokenExpiration,
              refreshNeeded: false,
            });
            if (provider.refreshWait) {
              await timer(10000);
            }
          }
        } catch (refreshErr) {
          await Integration.findByIdAndUpdate(integration._id, { refreshNeeded: true });
          await markPostsError(posts, "Access token expired - please reconnect your social account");
          return;
        }
      } else {
        await Integration.findByIdAndUpdate(integration._id, { refreshNeeded: true });
        await markPostsError(posts, "Access token expired - please reconnect your social account");
        return;
      }
    }

    const results = await provider.post(
      integration.internalId,
      token,
      postDetails,
      integration.toObject ? integration.toObject() : integration
    );

    for (const result of results) {
      await Post.findByIdAndUpdate(result.id, {
        state: "PUBLISHED",
        releaseURL: result.releaseURL || "",
        postId: result.postId || "",
        error: null,
      });
    }

    logger.info(`Published ${results.length} post(s) to ${integration.providerIdentifier}`);

    // Notify the user (honors their notification preferences)
    const userId = firstPost.userId?.toString();
    if (userId) {
      await notifyUser({
        userId,
        type: "post_published",
        title: `Published to ${integration.providerIdentifier}`,
        message: `${results.length} post${results.length === 1 ? "" : "s"} went live on ${integration.name || integration.providerIdentifier}.`,
        integrationId: integration._id?.toString(),
      });
    }
  } catch (err: any) {
    const isRefreshError = err instanceof RefreshTokenError || err.name === "RefreshTokenError";

    if (isRefreshError) {
      await Integration.findByIdAndUpdate(integration._id, { refreshNeeded: true });
      await markPostsError(posts, "Access token expired - please reconnect your social account");
      logger.error({ err }, `Token refresh needed for integration ${integration._id}`);
    } else {
      const errorMsg = err.message || "Unknown error while publishing";
      await markPostsError(posts, errorMsg);
      logger.error({ err }, `Failed to publish to ${integration.providerIdentifier}`);
    }
  }
}

async function markPostsError(posts: any[], errorMessage: string): Promise<void> {
  await Promise.all(
    posts.map((p: any) =>
      Post.findByIdAndUpdate(p._id, {
        state: "ERROR",
        error: errorMessage,
      })
    )
  );

  // Notify the user about the failure (honors their notification preferences)
  const firstPost = posts[0];
  const userId = firstPost?.userId?.toString();
  const integration = firstPost?.integrationId;
  if (userId) {
    const isTokenIssue = /token|reconnect|expired|refresh/i.test(errorMessage);
    await notifyUser({
      userId,
      type: isTokenIssue ? "token_expiring" : "post_failed",
      title: isTokenIssue
        ? `Reconnect ${integration?.providerIdentifier || "your account"}`
        : `Post failed on ${integration?.providerIdentifier || "a channel"}`,
      message: isTokenIssue
        ? "Your access token expired. Reconnect the account in Connected Accounts so scheduled posts can go out."
        : errorMessage.slice(0, 200),
      integrationId: integration?._id?.toString(),
    });
  }
}

/**
 * Applies the user's brand-kit watermark to opted-in post images.
 * Best-effort: any failure leaves the original media untouched so
 * watermarking never blocks publishing.
 */
async function applyWatermarks(postDetails: any[]): Promise<void> {
  const optedIn = postDetails.filter((p) => p._watermark && p.media?.length);
  if (!optedIn.length) return;

  const userId = optedIn[0]._userId;
  if (!userId) return;

  try {
    const brandKit: any = await BrandKit.findOne({ userId }).populate("watermarkLogo");
    const logoKey = brandKit?.watermarkLogo?.key;
    if (!logoKey) {
      logger.info({ userId }, "Watermark requested but no watermark logo in brand kit");
      return;
    }

    const logoUrl = await getS3Url(logoKey);
    const logoRes = await fetch(logoUrl);
    if (!logoRes.ok) return;
    const logoBuffer = Buffer.from(await logoRes.arrayBuffer());

    for (const post of optedIn) {
      for (const m of post.media) {
        try {
          const imgRes = await fetch(m.path);
          if (!imgRes.ok) continue;
          const contentType = imgRes.headers.get("content-type") || "";
          if (!contentType.startsWith("image/")) continue;

          const imageBuffer = Buffer.from(await imgRes.arrayBuffer());
          const watermarked = await applyWatermark(imageBuffer, logoBuffer);
          if (!watermarked) continue;

          const origKey = extractS3Key(m.path) || `users/${userId}/watermarked/${Date.now()}.png`;
          const wmKey = origKey.replace(/(\.[a-z]+)?$/, "") + "-wm.png";
          const wmUrl = await uploadToS3(`users/${userId}/watermarked/${wmKey.split("/").pop()}`, watermarked, "image/png");
          m.path = wmUrl;
          logger.info({ postId: post.id }, "Watermark applied to post image");
        } catch (err) {
          logger.warn({ err, postId: post.id }, "Watermark failed for media, using original");
        }
      }
    }
  } catch (err) {
    logger.warn({ err, userId }, "Watermark pass failed, publishing originals");
  }
}

export { publishToIntegration as publishGroup, JOB_NAME };
