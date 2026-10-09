# AutoSocial

**AI-powered social media scheduling for Facebook, Instagram, LinkedIn, and X.**

AutoSocial is a final-year project: a self-hosted alternative to Buffer/Hootsuite. Write once, preview per platform, schedule, and let it publish — with AI copy generation, brand-kit watermarks, engagement analytics, and in-app notifications.

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   React 19 SPA  │────▶│  Express 5 API  │────▶│    MongoDB      │
│  Vite + Tailwind│     │  better-auth    │     │  (Mongoose)     │
└─────────────────┘     └────────┬────────┘     └─────────────────┘
                                │
                    ┌───────────┼───────────┐
                    ▼           ▼           ▼
              ┌──────────┐ ┌─────────┐ ┌──────────┐
              │  Agenda  │ │ S3/R2   │ │ Social   │
              │ scheduler│ │ media   │ │ APIs     │
              └──────────┘ └─────────┘ └──────────┘
```

- **Frontend** (`frontend/`): React 19 + Vite + TypeScript + Tailwind 4. Feature folders (`features/dashboard`, `features/auth`), shadcn/ui primitives, React Query.
- **Backend** (`backend/`): Express 5, Mongoose models, Agenda job scheduler for timed publishing, better-auth for sessions.
- **Providers** (`backend/src/social/`): one class per network (Facebook, Instagram, X, LinkedIn) extending a shared `SocialProvider` base — OAuth, token refresh, publishing, and insights.
- **AI** (`backend/src/modules/ai/`): OpenAI-compatible generation with template fallback when no key is configured, brand-kit-aware prompts, per-platform copy rules.
- **Media** (`backend/src/modules/media/`): S3 presigned uploads, Sharp watermark compositing, ffmpeg video thumbnails.

## Quick Start

### Prerequisites

- Node.js 20+, pnpm 10 (`npm i -g pnpm`), MongoDB, ffmpeg (for video thumbnails)

### 1. Clone & install

```bash
git clone <repo-url> autosocial
cd autosocial
pnpm install
```

### 2. Configure

```bash
cp backend/.example.env backend/.env
```

Minimum viable `.env`:

```env
DATABASE_URL=mongodb://localhost:27017/autosocial
BETTER_AUTH_SECRET=<openssl rand -hex 32>
TOKEN_ENCRYPTION_KEY=<openssl rand -hex 32>
AWS_S3_BUCKET=<bucket>            # or MinIO / Cloudflare R2
AWS_ACCESS_KEY_ID=<...>
AWS_SECRET_ACCESS_KEY=<...>
# OPENAI_API_KEY=<...>            # optional — template fallback when unset
```

### 3. Seed & run

```bash
cd backend && pnpm seed          # demo user + sample posts + media
pnpm dev                          # backend on :3000 (Terminal 1)
cd ../frontend && pnpm dev        # frontend on :5173 (Terminal 2)
```

Log in with `demo@autosocial.local` / `Demo1234!`.

## API Reference

Base: `http://localhost:3000/api/v1` (all routes require auth unless noted).

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/sign-in/email` | Login (public) |
| GET | `/posts?state=PUBLISHED` | List posts (states: DRAFT, QUEUE, PUBLISHED, ERROR) |
| POST | `/posts` | Create/schedule posts (`{ type: "now"|"schedule"|"draft", posts: [...] }`) |
| GET | `/posts/analytics?tz=...` | Engagement totals, per-platform, best-time-to-post |
| POST | `/posts/refresh-insights` | Pull fresh metrics from platforms |
| GET | `/media` | Paginated media library (includes `thumbnailUrl` for videos) |
| POST | `/media/upload-url` | Presigned S3 upload URL |
| GET | `/integrations/list` | Connected accounts (tokens never exposed) |
| POST | `/ai/variations` | `{ topic, platform, count }` → 3 copy variations (LLM or template) |
| GET | `/ai/status` | `{ aiEnabled, provider }` |
| GET | `/ai/history` | Recent generation prompts |
| GET | `/notifications` | In-app notifications, newest first |
| GET | `/notifications/unread-count` | Badge count |
| PATCH | `/notifications/:id/read` | Mark one read |
| GET | `/brand-kit` / PUT | Brand colors, fonts, tones, logos |
| GET | `/settings` / PUT | Profile + notification preferences |

## Demo Script (FY presentation, ~10 min)

1. **Login** as the demo user — dashboard shows posts, scheduled queue, recent activity.
2. **Create Post** → open the **AI Composer**, type a topic, pick X → 3 variations appear with the brand context shown. Click "Use this".
3. Toggle **Brand watermark** on, attach an image from the **Media Library** (note video thumbnails, PDF uploads blocked with a clear error).
4. **Schedule** the post 2 minutes out. Watch it publish via the Agenda job.
5. **Analytics** → engagement cards, best-time-to-post, per-post dialog. Hit **Refresh insights**.
6. Open the **notification bell** — publish success/failure and token alerts appear here, gated by the toggles in **Settings**.
7. **Connected Accounts** — disconnect uses a proper confirm dialog, not `confirm()`.

## Project Phases

| Phase | Focus | Branch |
|-------|-------|--------|
| 0 | Repo hygiene, monorepo, CI-ready builds | `phase-0-foundation` |
| 1 | Security: auth hardening, token encryption, validation | `phase-1-security` |
| 2 | Publishing pipeline: Agenda jobs, media, provider fixes | `phase-2-publishing` |
| 3 | Publishing UI: calendar, dialogs, mobile layout | `phase-3-publishing-ui` |
| 4 | Resilience: error boundaries, 404, a11y, honest empty states | `phase-4-resilience-ux` |
| 5 | Analytics: engagement metrics, best-time-to-post, notifications | `phase-5-analytics-notifications` |
| 6 | AI composer: zero-config generation, brand-aware, per-platform | `phase-6-ai-composer` |
| 7 | Media intelligence: watermarks, video thumbnails, PDF policy | `phase-7-media-intelligence` |
| 8 | Polish, docs, demo | `phase-8-polish-docs` |

All work stays on local branches — nothing is pushed without explicit approval.

## License

MIT — final-year academic project.
