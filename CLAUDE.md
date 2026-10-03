@AGENTS.md

# OpenReply

Open-source Instagram comment-to-DM automation. A comment (or DM / story reply)
hits a Meta webhook, gets matched against active campaigns, and a background
worker sends the private reply plus an optional public reply.

## Two processes, two datastores

- **Web app** (`app/`, Next.js 16 App Router): dashboard, API routes, OAuth
  callback, and the Meta webhook (`app/api/webhook/route.ts`). Runs on Vercel.
- **Worker** (`worker/dm-worker.ts`, run with `tsx`): long-running. Consumes the
  BullMQ send queue (`lib/queue/dm-worker.ts`), runs the comment polling sweep
  (`lib/polling/comment-reconciler.ts`, every 5 min) and the next-reel binder
  (`lib/polling/next-reel-binder.ts`, hourly), and writes a Redis heartbeat
  (`lib/ops/worker-health.ts`). Cannot run on Vercel.
- **PostgreSQL** via Prisma 7 with `@prisma/adapter-pg` (`lib/db/client.ts`).
  The generated client lives in `app/generated/prisma` (gitignored; built by
  `prisma generate`).
- **Redis**: BullMQ queue, per-account DM rate limiter
  (`lib/utils/rate-limiter.ts`), webhook dedup, worker heartbeat and alerts.

Web app and worker must share `DATABASE_URL`, `REDIS_URL` and `ENCRYPTION_KEY`
(Instagram tokens are encrypted by the app and decrypted by the worker).

## Commands

```bash
npm run dev          # web app
npm run worker       # worker, second terminal
npm test             # vitest (tests in __tests__/)
npm run typecheck
npm run lint
npm run db:migrate   # prisma migrate deploy
```

Run `typecheck`, `lint` and `test` before committing. New schema changes need a
migration in `prisma/migrations/` (`npx prisma migrate dev --name <name>`).

## Production setup (this instance)

See `docs/stack.md` for details.

- Vercel for the web app; its build runs `prisma migrate deploy`.
- Supabase free plan for Postgres, through the pooler:
  - `DATABASE_URL` = transaction pooler, port `6543` (app and worker).
  - `DIRECT_URL` = session pooler, port `5432` (migrations only;
    `prisma.config.ts` prefers it). Session mode caps at 15 clients, so the app
    must not use it (`EMAXCONNSESSION`).
  - Both end in `?sslmode=require&uselibpqcompat=true`; plain
    `sslmode=require` fails certificate verification with `pg` 8.x.
- Worker: always-free Oracle VM, systemd unit `openreply-worker`, variables
  loaded from the clone's `.env`. Restart with
  `sudo systemctl restart openreply-worker`; logs via
  `journalctl -u openreply-worker`.
- Redis Cloud free plan; Resend for the magic-link sign-in fallback (primary sign-in is email + password).

## Rules

- Secrets go only in `.env` (gitignored) or the host's env settings. Never
  put real values in `.env.example`, docs, or this file; it is committed and
  the repo is public.
- Anything that polls the database keeps serverless Postgres awake. Check the
  cost on metered or free plans before adding or speeding up a polling loop.
- DMs are deduplicated per person per campaign by default
  (`DM_PERSON_SCOPE`, `DM_PERSON_COOLDOWN_HOURS`). A comment that gets a public
  reply but no DM, logged as `SKIPPED_DEDUP`, is expected behaviour, not a bug.
- Meta allows one private reply per comment, ever. Do not add retries that
  could send a second one.
- User-facing text may be Arabic or use accented Latin; keyword matching folds
  diacritics and handles Arabic script (see `__tests__/keyword-matcher*.test.ts`).
