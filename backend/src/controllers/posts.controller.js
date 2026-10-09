import mongoose from 'mongoose';
import { Post, Integration } from '../models/index.js';
import { makeId } from '../utils/makeId.js';
import { sendSuccess } from '../utils/response.util.js';
import { schedulePost, removeScheduledJobs } from '../services/scheduler.service.js';
import { refreshInsights } from '../services/insights.service.js';
import { normalizeMediaItem } from '../lib/media-url.js';
import { logger } from '../utils/logger.util.js';

async function listPosts(req, res) {
  try {
    const { from, to, state } = req.query;
    const query = { userId: req.user._id };

    if (from || to) {
      query.publishDate = {};
      if (from) query.publishDate.$gte = new Date(from);
      if (to) query.publishDate.$lte = new Date(to);
    }
    if (state) query.state = state;

    const posts = await Post.find(query)
      .populate('integrationId', 'name picture providerIdentifier profile')
      .sort({ publishDate: 1 });

    sendSuccess(res, { posts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function getPost(req, res) {
  try {
    const post = await Post.findOne({ _id: req.params.id, userId: req.user._id }).populate(
      'integrationId',
      'name picture providerIdentifier profile'
    );
    if (!post) return res.status(404).json({ error: 'Post not found' });
    sendSuccess(res, { post });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function createPost(req, res) {
  try {
    const { type = 'schedule', date, posts: rawPosts } = req.body;

    if (!rawPosts || !Array.isArray(rawPosts) || rawPosts.length === 0) {
      return res.status(400).json({ error: 'At least one post is required' });
    }

    const publishDate = type === 'now' ? new Date() : (date ? new Date(date) : null);
    if (type !== 'draft' && !publishDate) {
      return res.status(400).json({ error: 'A publish date is required for scheduled posts' });
    }

    // Validate integrations only for non-draft posts
    if (type !== 'draft') {
      const integrationIds = [...new Set(rawPosts.filter(p => p.integrationId).map((p) => p.integrationId))];
      if (integrationIds.length > 0) {
        const integrations = await Integration.find({
          _id: { $in: integrationIds },
          userId: req.user._id,
        });
        if (integrations.length !== integrationIds.length) {
          return res.status(403).json({ error: 'One or more integrations are invalid' });
        }
      }
    }

    const group = makeId(8);
    const state = type === 'draft' ? 'DRAFT' : 'QUEUE';

    const createdPosts = [];
    let parentPostId = null;

    for (const rawPost of rawPosts) {
      const postData = {
        userId: req.user._id,
        content: rawPost.content || '',
        publishDate: publishDate || new Date(),
        state,
        group,
        settings: JSON.stringify(rawPost.settings || {}),
        // Normalize media: always { path, key? } objects. The S3 key is
        // captured now so publish time can mint a fresh presigned URL —
        // the presigned URL in `path` expires within minutes.
        image: JSON.stringify((rawPost.media || []).map(normalizeMediaItem)),
        parentPostId,
      };
      if (rawPost.integrationId) {
        postData.integrationId = rawPost.integrationId;
      }

      const post = await Post.create(postData);

      if (!parentPostId) parentPostId = post._id;
      createdPosts.push(post);
    }

    if (type === 'now') {
      // Schedule for immediate execution
      await schedulePost(group, new Date());
    } else if (type === 'schedule' && publishDate) {
      // Schedule for future execution
      await schedulePost(group, publishDate);
    }

    sendSuccess(res, { posts: createdPosts, group }, 201);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

async function updatePost(req, res) {
  try {
    const { content, date, settings, media } = req.body;
    const post = await Post.findOne({ _id: req.params.id, userId: req.user._id });

    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (!['QUEUE', 'DRAFT'].includes(post.state)) {
      return res.status(400).json({ error: 'Can only edit queued or draft posts' });
    }

    const updates = {};
    if (content !== undefined) updates.content = content;
    if (date) updates.publishDate = new Date(date);
    if (settings !== undefined) updates.settings = JSON.stringify(settings);
    if (media !== undefined) updates.image = JSON.stringify(media.map(normalizeMediaItem));
    // Only allow user-driven transitions to DRAFT or QUEUE — never PUBLISHED/ERROR directly
    if (req.body.state !== undefined) {
      if (!['DRAFT', 'QUEUE'].includes(req.body.state)) {
        return res.status(400).json({ error: 'Invalid state transition' });
      }
      updates.state = req.body.state;
    }

    const updated = await Post.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });

    // If scheduling (changing state to QUEUE with a date), create an Agenda job
    if (updated.state === 'QUEUE' && updated.publishDate) {
      await removeScheduledJobs(post.group);
      await schedulePost(post.group, new Date(updated.publishDate));
    } else if (post.state === 'QUEUE' && updated.state !== 'QUEUE') {
      // Leaving QUEUE (e.g. cancelled back to DRAFT): drop the stale job so it
      // never fires for a post that is no longer queued.
      await removeScheduledJobs(post.group);
    }

    sendSuccess(res, { post: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

async function deletePost(req, res) {
  try {
    const post = await Post.findOne({ _id: req.params.id, userId: req.user._id });
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const wasQueued = post.state === 'QUEUE';
    await Post.deleteOne({ _id: post._id, userId: req.user._id });

    // Remove scheduled Agenda jobs only if no QUEUE posts remain in the group
    if (wasQueued) {
      const remaining = await Post.countDocuments({ group: post.group, state: 'QUEUE', userId: req.user._id });
      if (remaining === 0) {
        await removeScheduledJobs(post.group);
      }
    }

    sendSuccess(res, { success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

async function getStats(req, res) {
  try {
    const userId = req.user._id;
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Posts this month
    const postsThisMonth = await Post.countDocuments({
      userId,
      state: "PUBLISHED",
      publishDate: { $gte: startOfMonth, $lte: now },
    });

    // Posts last month (for comparison)
    const postsLastMonth = await Post.countDocuments({
      userId,
      state: "PUBLISHED",
      publishDate: { $gte: startOfPrevMonth, $lte: endOfPrevMonth },
    });

    const postsChange = postsLastMonth > 0
      ? Math.round(((postsThisMonth - postsLastMonth) / postsLastMonth) * 100)
      : postsThisMonth > 0 ? 100 : 0;

    // Upcoming posts in next 7 days
    const upcomingPosts = await Post.countDocuments({
      userId,
      state: "QUEUE",
      publishDate: { $gte: now, $lte: in7Days },
    });

    // Posts by platform (for breakdown)
    const postsByPlatform = await Post.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId), state: "PUBLISHED" } },
      {
        $lookup: {
          from: "integrations",
          localField: "integrationId",
          foreignField: "_id",
          as: "integration",
        },
      },
      { $unwind: { path: "$integration", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: "$integration.providerIdentifier",
          count: { $sum: 1 },
        },
      },
    ]);

    sendSuccess(res, {
      postsThisMonth,
      postsChange,
      upcomingPosts,
      postsByPlatform: postsByPlatform.reduce((acc, item) => {
        acc[item._id || "unknown"] = item.count;
        return acc;
      }, {}),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function getAnalytics(req, res) {
  try {
    const userId = req.user._id;
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    const startOf3MonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);

    // Total published posts
    const totalPosts = await Post.countDocuments({ userId, state: "PUBLISHED" });

    // Posts this month vs last month
    const postsThisMonth = await Post.countDocuments({
      userId,
      state: "PUBLISHED",
      publishDate: { $gte: startOfMonth, $lte: now },
    });
    const postsLastMonth = await Post.countDocuments({
      userId,
      state: "PUBLISHED",
      publishDate: { $gte: startOfPrevMonth, $lte: endOfPrevMonth },
    });
    const postsGrowth = postsLastMonth > 0
      ? Math.round(((postsThisMonth - postsLastMonth) / postsLastMonth) * 100)
      : postsThisMonth > 0 ? 100 : 0;

    // Posts by platform
    const postsByPlatform = await Post.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId), state: "PUBLISHED" } },
      {
        $lookup: {
          from: "integrations",
          localField: "integrationId",
          foreignField: "_id",
          as: "integration",
        },
      },
      { $unwind: { path: "$integration", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: "$integration.providerIdentifier",
          count: { $sum: 1 },
        },
      },
    ]);

    // Best platform (most posts)
    const platformMap = postsByPlatform.reduce((acc, item) => {
      acc[item._id || "unknown"] = item.count;
      return acc;
    }, {});
    const bestPlatform = Object.entries(platformMap).sort((a, b) => b[1] - a[1])[0];

    // Posts per month (last 6 months for chart)
    const monthlyPosts = await Post.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(userId),
          state: "PUBLISHED",
          publishDate: { $gte: startOf3MonthsAgo },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$publishDate" },
            month: { $month: "$publishDate" },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]);

    // Posts by status (for pie chart)
    const postsByStatus = await Post.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId) } },
      { $group: { _id: "$state", count: { $sum: 1 } } },
    ]);

    // Total drafts
    const totalDrafts = await Post.countDocuments({ userId, state: "DRAFT" });

    // Total scheduled
    const totalScheduled = await Post.countDocuments({ userId, state: "QUEUE" });

    // Total errors
    const totalErrors = await Post.countDocuments({ userId, state: "ERROR" });

    // Aggregate engagement across published posts
    const engagementAgg = await Post.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId), state: "PUBLISHED" } },
      {
        $group: {
          _id: null,
          impressions: { $sum: { $ifNull: ["$engagement.impressions", 0] } },
          reach: { $sum: { $ifNull: ["$engagement.reach", 0] } },
          likes: { $sum: { $ifNull: ["$engagement.likes", 0] } },
          comments: { $sum: { $ifNull: ["$engagement.comments", 0] } },
          shares: { $sum: { $ifNull: ["$engagement.shares", 0] } },
          clicks: { $sum: { $ifNull: ["$engagement.clicks", 0] } },
        },
      },
    ]);
    const totalEngagement = engagementAgg[0] || {
      impressions: 0, reach: 0, likes: 0, comments: 0, shares: 0, clicks: 0,
    };
    delete totalEngagement._id;

    // Engagement by platform (for per-platform bars)
    const engagementByPlatform = await Post.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId), state: "PUBLISHED" } },
      {
        $lookup: {
          from: "integrations",
          localField: "integrationId",
          foreignField: "_id",
          as: "integration",
        },
      },
      { $unwind: { path: "$integration", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: "$integration.providerIdentifier",
          impressions: { $sum: { $ifNull: ["$engagement.impressions", 0] } },
          likes: { $sum: { $ifNull: ["$engagement.likes", 0] } },
          comments: { $sum: { $ifNull: ["$engagement.comments", 0] } },
          shares: { $sum: { $ifNull: ["$engagement.shares", 0] } },
          posts: { $sum: 1 },
        },
      },
    ]);

    // Best time to post: average engagement per publish hour (0-23), top 3.
    // Uses the viewer's timezone when supplied (?tz=Asia/Karachi), else UTC.
    const tz = typeof req.query.tz === "string" && req.query.tz ? req.query.tz : "UTC";
    let hourExpr = { $hour: "$publishDate" };
    try {
      // Validate the timezone by formatting a date with it
      new Intl.DateTimeFormat("en", { timeZone: tz }).format(new Date());
      hourExpr = { $hour: { date: "$publishDate", timezone: tz } };
    } catch {
      // Invalid timezone — fall back to UTC
    }
    const hourlyEngagement = await Post.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(userId),
          state: "PUBLISHED",
          "engagement.impressions": { $gt: 0 },
        },
      },
      {
        $group: {
          _id: hourExpr,
          avgEngagement: {
            $avg: {
              $add: [
                { $ifNull: ["$engagement.impressions", 0] },
                { $multiply: [{ $ifNull: ["$engagement.likes", 0] }, 5] },
                { $multiply: [{ $ifNull: ["$engagement.comments", 0] }, 10] },
                { $multiply: [{ $ifNull: ["$engagement.shares", 0] }, 8] },
              ],
            },
          },
          posts: { $sum: 1 },
        },
      },
      { $sort: { avgEngagement: -1 } },
      { $limit: 3 },
    ]);
    const bestTimes = hourlyEngagement.map((h) => ({
      hour: h._id,
      label: formatHour(h._id),
      posts: h.posts,
    }));

    sendSuccess(res, {
      totalPosts,
      postsGrowth,
      postsByPlatform: platformMap,
      bestPlatform: bestPlatform ? bestPlatform[0] : null,
      monthlyPosts,
      postsByStatus: postsByStatus.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      totalDrafts,
      totalScheduled,
      totalErrors,
      totalEngagement,
      engagementByPlatform: engagementByPlatform.reduce((acc, item) => {
        acc[item._id || "unknown"] = item;
        return acc;
      }, {}),
      bestTimes,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

function formatHour(h) {
  const ampm = h >= 12 ? "PM" : "AM";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:00 ${ampm}`;
}

export { listPosts, getPost, createPost, updatePost, deletePost, getStats, getAnalytics, refreshPostInsights };

/**
 * POST /posts/refresh-insights
 * Pulls fresh engagement metrics from platforms for recent published posts.
 */
async function refreshPostInsights(req, res) {
  try {
    const summary = await refreshInsights(req.user._id.toString());
    res.json(summary);
  } catch (err) {
    logger.error({ err }, "Insights refresh endpoint failed");
    res.status(500).json({ error: "Failed to refresh insights" });
  }
}
