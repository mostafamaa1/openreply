# Stack

Everything OpenReply needs to run, in one place: the application libraries, the
runtime processes, and the specific (free) services this instance is deployed on.
For the step-by-step setup, see [setup.md](setup.md).

## Application

| Layer | Tool |
| --- | --- |
| Framework | Next.js 16 (App Router, Turbopack) + React 19 |
| Language | TypeScript 5 |
| ORM / DB | Prisma 7 with the `@prisma/adapter-pg` driver, PostgreSQL |
| Queue | BullMQ 5 on Redis, via `ioredis` |
| Auth | Auth.js / NextAuth 5 (email magic links) |
| Email | Resend (login links) |
| Validation | Zod 4 |
| Charts | Recharts 3 |
| Styling | Tailwind CSS 4 |
| Tests | Vitest 4 |
| Worker runtime | `tsx` (runs `worker/dm-worker.ts`) |
| Instagram | Official Meta Graph API (Instagram Login) |

## Runtime — two processes, two datastores

- **Web app + API** (`npm run dev` / `npm start`): Next.js. Serves the dashboard,
  the OAuth callback, and the incoming webhook. Serverless-friendly; runs on Vercel.
- **Worker** (`npm run worker`): a long-running Node process. Consumes the send
  queue, sends the DMs, runs the polling reconciler, and performs the follow-gate
  `is_user_follow_business` checks. **Must stay always-on**, so it cannot run on
  Vercel — it needs an always-on host.
- **PostgreSQL**: campaigns, DM logs, accounts, sessions, tracked links, click events.
- **Redis**: the BullMQ send queue and the per-account rate limiter. Must speak the
  native Redis protocol over TCP (an HTTP-only Redis will not work with BullMQ).

The web app and the worker must share the same `DATABASE_URL`, `REDIS_URL`, and
`ENCRYPTION_KEY`. The web app stores the encrypted Instagram token; the worker
decrypts it to send. Different keys mean every send fails to decrypt.

## Reference free deployment

The zero-cost stack this instance runs on. Alternatives (e.g. Railway for the
worker + Postgres + Redis) are covered in [setup.md](setup.md).

| Piece | Service | Free tier |
| --- | --- | --- |
| Web app | Vercel | Hobby is enough; Pro raises cron frequency and limits |
| PostgreSQL | Supabase | Free (500 MB, always-on compute) |
| Redis | Redis Cloud (Essentials) | Free (30 MB, TCP) |
| Worker (24/7) | Oracle Cloud "Always Free" VM (VM.Standard.E2.1.Micro, Ubuntu 22.04), run as a systemd service | Free forever |
| Login email | Resend | Free (3k emails/mo) |
| Instagram API | Meta app with Instagram Login | Free |

### Why Supabase and not Neon's free plan

Neon's free plan caps compute at 100 CU-hours a month and only suspends the
database after 5 idle minutes. The worker's comment sweep runs every 5 minutes
(`COMMENT_POLL_INTERVAL_MS`), so the database never gets to sleep: at the
smallest size that is about 6 CU-hours a day, and the project is paused after
roughly 17 days. Supabase's free plan has no compute-hour cap, so the worker's
constant polling costs nothing. If you stay on Neon's free plan, raise
`COMMENT_POLL_INTERVAL_MS` to 30 minutes or more.

### Connecting to Supabase

Use the pooler host (`*.pooler.supabase.com`), not the direct host: the direct
connection is IPv6-only, and Vercel and most VMs cannot reach it. The pooler has
two ports on the same host:

| Variable | Port | Mode | Why |
| --- | --- | --- | --- |
| `DATABASE_URL` | `6543` | Transaction | The app and the worker. Allows ~200 clients; session mode caps the free plan at 15, and serverless functions plus the worker exhaust that (`EMAXCONNSESSION`). |
| `DIRECT_URL` | `5432` | Session | `prisma migrate` only (`prisma.config.ts` prefers it). Migrations take a session-level advisory lock that transaction mode cannot hold. |

Both URLs end in `?sslmode=require&uselibpqcompat=true`. With plain
`sslmode=require`, `pg` 8.x verifies the certificate chain and fails with
`self-signed certificate in certificate chain`. The worker does not run
migrations, so it only needs `DATABASE_URL`.

### Worker service

The worker runs from a clone of the repo on the VM as the systemd unit
`openreply-worker`, which loads its variables from the clone's `.env`
(`EnvironmentFile=`). Common commands:

```bash
sudo systemctl restart openreply-worker     # after changing .env or pulling code
systemctl is-active openreply-worker
journalctl -u openreply-worker -n 50 --no-pager
```

The worker also writes a heartbeat to Redis (`health:worker:dm`, 120 s TTL) with
its pid, hostname and start time, which is the quickest way to tell whether it
is alive and which machine it runs on.

## Environment variables

Names only — values live in `.env` (gitignored) or the host's env settings, never
in the repo. Full descriptions are in [setup.md](setup.md#environment-variables).

`NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `CRON_SECRET`, `ENCRYPTION_KEY`, `DATABASE_URL`,
`DIRECT_URL` (web app only, for migrations), `REDIS_URL`, `RESEND_API_KEY`,
`EMAIL_FROM`, `META_GRAPH_API_VERSION`, `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`,
`FACEBOOK_APP_SECRET`, `WEBHOOK_VERIFY_TOKEN`.
