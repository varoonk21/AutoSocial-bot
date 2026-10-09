import { Post, Integration } from "../models/index.js";
import { getProvider } from "./scheduler.service.js";
import { decryptStoredToken } from "../lib/crypto.js";
import { logger } from "../utils/logger.util.js";

const STALE_AFTER_HOURS = 24;

/**
 * Pulls fresh engagement metrics from each platform for the user's recent
 * published posts and stores them on the post. Providers return null when
 * metrics are unavailable (bad token, missing scopes) — those posts keep
 * their last stored values.
 *
 * @returns summary of what was refreshed
 */
export async function refreshInsights(userId: string): Promise<{
  checked: number;
  updated: number;
  skipped: number;
}> {
  const staleCutoff = new Date(Date.now() - STALE_AFTER_HOURS * 60 * 60 * 1000);

  const posts = await Post.find({
    userId,
    state: "PUBLISHED",
    postId: { $exists: true, $ne: "" },
    $or: [
      { "engagement.updatedAt": { $exists: false } },
      { "engagement.updatedAt": { $lt: staleCutoff } },
    ],
  })
    .sort({ publishDate: -1 })
    .limit(50)
    .populate("integrationId");

  let updated = 0;
  let skipped = 0;

  for (const post of posts) {
    const integration: any = post.integrationId;
    if (!integration || !integration.token) {
      skipped++;
      continue;
    }

    try {
      const provider = getProvider(integration.providerIdentifier);
      if (!provider || typeof provider.getPostInsights !== "function") {
        skipped++;
        continue;
      }

      let token: string;
      try {
        token = decryptStoredToken(integration.token);
      } catch {
        skipped++;
        continue;
      }

      const insights = await provider.getPostInsights(
        post.postId,
        token,
        integration.toObject ? integration.toObject() : integration
      );

      if (!insights) {
        skipped++;
        continue;
      }

      await Post.findByIdAndUpdate(post._id, {
        engagement: { ...insights, updatedAt: new Date() },
      });
      updated++;
    } catch (err) {
      logger.warn({ err, postId: post._id }, "Insights refresh failed for post");
      skipped++;
    }
  }

  logger.info({ userId, checked: posts.length, updated, skipped }, "Insights refresh complete");
  return { checked: posts.length, updated, skipped };
}
