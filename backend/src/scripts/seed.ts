/**
 * Seed script — creates demo data for local development.
 *
 * Usage: pnpm --filter ./backend seed
 *
 * Creates (idempotently):
 *   - demo user: demo@autosocial.local / Demo1234!
 *   - 4 placeholder social integrations (tokens are fake; reconnect to publish)
 *   - media assets uploaded to the configured S3 bucket
 *   - posts in every state: DRAFT, QUEUE (really scheduled via Agenda),
 *     PUBLISHED, ERROR
 *
 * Requires a valid backend/.env (DATABASE_URL, S3, OPENAI_API_KEY, ...).
 */
import mongoose from "mongoose";
import "../config/env.config.js"; // validates env, fails fast
import { connectDB } from "../lib/mongoose.js";
import { auth } from "../config/auth.js";
import { Integration, Media, Post } from "../models/index.js";
import { uploadToS3, getS3Url } from "../lib/s3.js";
import { schedulePost } from "../services/scheduler.service.js";
import { getAgenda, stopAgenda } from "../lib/agenda.js";
import { JOB_NAME } from "../jobs/publish.job.js";
import { makeId } from "../utils/makeId.js";
import { encryptToken } from "../lib/crypto.js";
import { logger } from "../utils/logger.util.js";

const DEMO_EMAIL = "demo@autosocial.local";
const DEMO_PASSWORD = "Demo1234!";
const DEMO_NAME = "Demo Creator";

const PICSUM = (seed: string, w = 1200, h = 800) => `https://picsum.photos/seed/${seed}/${w}/${h}`;

async function getOrCreateDemoUser() {
  try {
    const result = await auth.api.signUpEmail({
      body: { name: DEMO_NAME, email: DEMO_EMAIL, password: DEMO_PASSWORD },
    });
    logger.info(`Demo user created: ${DEMO_EMAIL}`);
    return result.user;
  } catch (err) {
    // Assume the user already exists — look it up directly.
    const existing = await mongoose.connection.collection("users").findOne({ email: DEMO_EMAIL });
    if (!existing) throw err;
    logger.info(`Demo user already exists: ${DEMO_EMAIL}`);
    return existing;
  }
}

async function seedIntegrations(userId: mongoose.Types.ObjectId) {
  const providers = [
    { providerIdentifier: "facebook", name: "Demo Facebook Page" },
    { providerIdentifier: "instagram", name: "Demo Instagram Account" },
    { providerIdentifier: "x", name: "Demo X Account" },
    { providerIdentifier: "linkedin", name: "Demo LinkedIn Profile" },
  ] as const;

  for (const p of providers) {
    await Integration.findOneAndUpdate(
      { userId, internalId: `seed-${p.providerIdentifier}` },
      {
        userId,
        internalId: `seed-${p.providerIdentifier}`,
        providerIdentifier: p.providerIdentifier,
        name: p.name,
        picture: PICSUM(`avatar-${p.providerIdentifier}`, 200, 200),
        // Placeholder tokens are encrypted like real ones (reconnect to publish for real)
        token: encryptToken("SEED_PLACEHOLDER_NOT_A_REAL_TOKEN"),
        profile: "demo",
        disabled: false,
        refreshNeeded: false,
        additionalSettings: "[]",
      },
      { upsert: true, setDefaultsOnInsert: true, runValidators: true },
    );
  }
  logger.info("Seeded 4 placeholder integrations (reconnect them to publish for real)");
  return Integration.find({ userId });
}

async function seedMedia(userId: mongoose.Types.ObjectId) {
  const assets = [
    { seed: "autosocial-1", name: "Workspace flatlay" },
    { seed: "autosocial-2", name: "Product shot" },
    { seed: "autosocial-3", name: "Team offsite" },
  ];
  const created: Array<{ key: string; url: string }> = [];

  for (const asset of assets) {
    const existing = await Media.findOne({ userId, key: `seed/${asset.seed}.jpg` });
    if (existing) {
      created.push({ key: existing.key, url: await getS3Url(existing.key) });
      continue;
    }
    try {
      const res = await fetch(PICSUM(asset.seed));
      if (!res.ok) throw new Error(`picsum returned ${res.status}`);
      const buffer = Buffer.from(await res.arrayBuffer());
      const key = await uploadToS3(`seed/${asset.seed}.jpg`, buffer, "image/jpeg");
      await Media.create({
        userId,
        name: asset.name,
        originalName: `${asset.seed}.jpg`,
        type: "image",
        source: "user",
        fileSize: buffer.length,
        key,
        alt: asset.name,
      });
      created.push({ key, url: await getS3Url(key) });
      logger.info(`Seeded media: ${asset.name}`);
    } catch (err) {
      logger.warn({ err }, `Skipping media seed for ${asset.name} (S3/network unavailable)`);
    }
  }
  return created;
}

async function seedPosts(userId: mongoose.Types.ObjectId, media: Array<{ key: string; url: string }>) {
  const hoursFromNow = (h: number) => new Date(Date.now() + h * 3600 * 1000);
  const daysAgo = (d: number) => new Date(Date.now() - d * 24 * 3600 * 1000);
  const mediaJson = JSON.stringify(media.slice(0, 2).map((m) => ({ path: m.url })));

  // Plausible demo engagement — varied publish hours so best-time-to-post has signal
  const engagement = (impressions: number, likes: number, comments: number, shares: number) => ({
    impressions,
    reach: Math.round(impressions * 0.7),
    likes,
    comments,
    shares,
    clicks: Math.round(impressions * 0.02),
    updatedAt: new Date(),
  });

  const atHour = (d: number, hour: number) => {
    const dt = daysAgo(d);
    dt.setHours(hour, 15, 0, 0);
    return dt;
  };

  const specs: Array<{
    content: string;
    publishDate: Date;
    state: "DRAFT" | "QUEUE" | "PUBLISHED" | "ERROR";
    image?: string;
    error?: string;
    engagement?: ReturnType<typeof engagement>;
  }> = [
    {
      content: "Draft idea: behind-the-scenes of our launch week. Still tweaking the caption…",
      publishDate: hoursFromNow(5),
      state: "DRAFT",
      image: media.length > 0 ? mediaJson : "[]",
    },
    {
      content: "Another draft — product teaser copy goes here.",
      publishDate: hoursFromNow(26),
      state: "DRAFT",
    },
    {
      content: "Queued post: our weekly roundup goes live soon. (Seed data — text only so the scheduled job always succeeds.)",
      publishDate: hoursFromNow(2),
      state: "QUEUE",
    },
    {
      content: "Queued post: reminder — webinar starts tomorrow at 3pm. (Seed data.)",
      publishDate: hoursFromNow(25),
      state: "QUEUE",
    },
    {
      content: "We shipped our new media library this week. Here's a peek at the new grid view.",
      publishDate: atHour(2, 9),
      state: "PUBLISHED",
      image: JSON.stringify([{ path: PICSUM("published-1") }]),
      engagement: engagement(2450, 187, 24, 31),
    },
    {
      content: "Throwback to the team offsite — already planning the next one.",
      publishDate: atHour(6, 18),
      state: "PUBLISHED",
      image: JSON.stringify([{ path: PICSUM("published-2") }]),
      engagement: engagement(3120, 245, 38, 42),
    },
    {
      content: "Text-only announcement: office hours are changing next month.",
      publishDate: atHour(9, 9),
      state: "PUBLISHED",
      engagement: engagement(980, 45, 6, 8),
    },
    {
      content: "Quick tip: schedule your week of content in one sitting. Future you says thanks.",
      publishDate: atHour(4, 12),
      state: "PUBLISHED",
      engagement: engagement(4210, 312, 51, 67),
    },
    {
      content: "Behind the scenes: how we plan our content calendar each month.",
      publishDate: atHour(7, 18),
      state: "PUBLISHED",
      engagement: engagement(2870, 198, 29, 35),
    },
    {
      content: "This post failed to publish (simulated seed error) — check the error state UI.",
      publishDate: daysAgo(1),
      state: "ERROR",
      error: "Simulated failure: seed data",
    },
  ];

  // Clear previous seed posts so re-running stays idempotent. Cancel their
  // scheduled publish jobs first so stale jobs don't pile up in Agenda.
  const staleGroups = await Post.distinct("group", {
    userId,
    content: /\(Seed data|seed error|Draft idea|Another draft|Queued post|We shipped|Throwback|Text-only announcement|This post failed|Quick tip|Behind the scenes/,
  });
  if (staleGroups.length > 0) {
    const agenda = await getAgenda();
    let cancelled = 0;
    for (const groupId of staleGroups) {
      cancelled += await agenda.cancel({ name: JOB_NAME, data: { groupId } });
    }
    logger.info(`Cancelled ${cancelled} stale seed publish job(s)`);
  }
  await Post.deleteMany({ userId, content: /\(Seed data|seed error|Draft idea|Another draft|Queued post|We shipped|Throwback|Text-only announcement|This post failed|Quick tip|Behind the scenes/ });

  for (const spec of specs) {
    const group = makeId(8);
    const post = await Post.create({
      userId,
      content: spec.content,
      publishDate: spec.publishDate,
      state: spec.state,
      group,
      settings: "{}",
      image: spec.image ?? "[]",
      error: spec.error,
      engagement: spec.engagement,
    });
    if (spec.state === "QUEUE") {
      await schedulePost(group, spec.publishDate);
      logger.info(`Scheduled seed post for ${spec.publishDate.toISOString()}`);
    }
  }
  logger.info(`Seeded ${specs.length} posts across DRAFT / QUEUE / PUBLISHED / ERROR`);
}

async function main() {
  await connectDB();

  const user = await getOrCreateDemoUser();
  const rawId = (user as { _id?: unknown; id?: unknown })._id ?? (user as { id?: unknown }).id;
  const userId = new mongoose.Types.ObjectId(String(rawId));

  // Wipe previous seed content for this user (keeps re-runs clean).
  await Integration.deleteMany({ userId, internalId: { $regex: "^seed-" } });
  await Media.deleteMany({ userId, key: { $regex: "^seed/" } });

  await seedIntegrations(userId);
  const media = await seedMedia(userId);
  await seedPosts(userId, media);

  console.log("\nSeed complete. Log in with:");
  console.log(`  email:    ${DEMO_EMAIL}`);
  console.log(`  password: ${DEMO_PASSWORD}`);
  console.log("\nNote: seeded integrations use placeholder tokens — reconnect a real");
  console.log("social account before publishing. Seeded media URLs are presigned and");
  console.log("expire; set S3_PUBLIC_URL in .env for permanent links.\n");

  await stopAgenda().catch(() => undefined);
  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (err) => {
  logger.error({ err }, "Seed failed");
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
