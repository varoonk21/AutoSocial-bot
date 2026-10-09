/**
 * Post Scheduler Service
 *
 * Uses Agenda.js for reliable job scheduling with:
 * - MongoDB persistence (survives server restarts)
 * - Automatic retries with backoff
 * - Distributed locking (no duplicate posts)
 * - Event-driven (no polling waste)
 */

import { getAgenda } from '../lib/agenda.js';
import { JOB_NAME } from '../jobs/publish.job.js';
import { logger } from '../utils/logger.util.js';

// ─── Provider Registry ────────────────────────────────────────────────────────

import { FacebookProvider } from '../social/facebook.provider.js';
import { InstagramProvider } from '../social/instagram.provider.js';
import { XProvider } from '../social/x.provider.js';
import { LinkedInProvider } from '../social/linkedin.provider.js';

const providers = {
  facebook: new FacebookProvider(),
  instagram: new InstagramProvider(),
  x: new XProvider(),
  linkedin: new LinkedInProvider(),
};

/**
 * Gets the provider instance for a given identifier.
 * @param {string} identifier - 'facebook' | 'instagram' | 'x' | 'linkedin'
 * @returns {SocialProvider}
 */
function getProvider(identifier) {
  const provider = providers[identifier];
  if (!provider) throw new Error(`Unknown provider: ${identifier}`);
  return provider;
}

// ─── Schedule Post ────────────────────────────────────────────────────────────

/**
 * Schedules a post group to be published at a specific time.
 *
 * @param {string} groupId - The group ID of posts to publish
 * @param {Date} publishDate - When to publish
 * @param {object} [options] - Additional options
 * @param {number} [options.priority] - Job priority (higher = sooner)
 * @param {number} [options.retryLimit] - Number of retries on failure
 */
async function schedulePost(groupId, publishDate, options = {}) {
  const agenda = await getAgenda();

  const job = await agenda.schedule(publishDate, JOB_NAME, {
    groupId,
  });

  if (options.priority) {
    job.attrs.priority = options.priority;
  }
  if (options.retryLimit) {
    job.attrs.retry = { retryLimit: options.retryLimit };
  }

  await job.save();

  logger.info({ groupId, publishDate }, "Post job scheduled");
  return job;
}

/**
 * Removes all scheduled jobs for a group (used when cancelling/rescheduling).
 *
 * @param {string} groupId - The group ID to remove jobs for
 */
async function removeScheduledJobs(groupId) {
  const agenda = await getAgenda();
  const removed = await agenda.cancel({ name: JOB_NAME, data: { groupId } });
  logger.info({ groupId, removed }, "Removed scheduled jobs");
  return removed;
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

/**
 * Initializes Agenda and starts the scheduler.
 * Call once on application startup.
 */
async function startScheduler() {
  const agenda = await getAgenda();
  logger.info("Scheduler service initialized");
  return agenda;
}

/**
 * Stops the scheduler gracefully.
 * Call on application shutdown.
 */
async function stopScheduler() {
  const { stopAgenda } = await import('../lib/agenda.js');
  await stopAgenda();
}

export { startScheduler, stopScheduler, schedulePost, removeScheduledJobs, getProvider };
