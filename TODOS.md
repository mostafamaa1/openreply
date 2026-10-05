# TODOs

Deferred during the content-agents + dashboard redesign (feat/content-agents-dashboard,
shipped as 0.2.0). Each item was found by the pre-landing review and explicitly deferred,
not forgotten.

## Security / correctness
- `lib/auth.ts`: JWT sessions (30 days) are not revocable on password change. Changing
  your password does not sign out other devices.
- `lib/queue/content-agents.ts`: if Redis takes the SET for the Run-now cooldown but the
  app's 2s timeout already gave up, the cooldown key can land after the route returned
  503, locking the workspace out of a manual run for 6h with nothing queued. Needs
  `after()`/`waitUntil()` to guarantee the cleanup runs, or a per-command Redis timeout.
- `worker/dm-worker.ts`: `failInterruptedRuns()` has no timeout. If the Supabase pooler
  hangs on that query at boot, the content-agents worker never starts (and logs nothing).
  Needs a bounded wait before falling through to `run()`.
- `proxy.ts`: `PROTECTED_PREFIXES` doesn't list `/agents` (or the pre-existing `/campaigns`,
  `/inbox`, `/overview`). The API layer underneath is correctly auth-gated, so nothing
  leaks, but an unauthenticated visitor briefly sees the page shell before the fetch 401s.
- `lib/agents/telegram.ts`: `sendTelegramMessage`'s truncation assumes every HTML tag opens
  and closes within one pushed line. True today, not enforced by the function.

## Performance / cost
- `app/api/agents/route.ts`: ~15 Prisma queries per poll (one per agent, times 3). Polling
  is now visibility-gated and slows to 60s when idle, but the query count itself could be
  consolidated into fewer round trips.
- `lib/analytics/dms.ts`: loads the whole windowed DmLog set into memory instead of
  aggregating in SQL. The new `(workspaceId, createdAt)` index helps the scan; the
  aggregation itself is still in JS.
- `lib/analytics/instagram.ts`: per-post Graph insight calls have no per-media cache, so a
  rate limit mid-run returns partial results. No in-flight lock either — switching ranges
  quickly (7D → 30D → 90D → 12M) fires one full cold fetch per click, each burning Graph
  quota even though only the last one's result is shown.
- `lib/agents/own-stats.ts`: up to 500 insight calls per agent run.
- `lib/agents/run.ts`: a workspace with more than one connected Instagram account only
  gets agent output for the newest one.

## Data
- `PostCategory` has no cascade behavior on `InstagramAccount` disconnect/reconnect, so a
  manual tag survives a reconnect under a new account row's id and is effectively lost.
- `prisma/schema.prisma`: `DmLog` keeps both `@@index([workspaceId])` and the new
  `@@index([workspaceId, createdAt])`; the single-column index is now redundant and could
  be dropped in a later migration.

## UX
- `app/(dashboard)/logs/page.tsx`: no "All time" range option; the logs page always sends
  a date range.

## Design (lower severity, from the pre-landing review)
- `lib/reports/follower-history.ts`: `ensureFollowerHistory`'s `knownFollowers` parameter
  is optional with a fallback fetch that no caller actually exercises.
- A few CSS `!important` utilities remain from unlayered component styles (`.panel`,
  `.tally`, `.skeleton`); a `@layer` refactor was scoped out of this ship.

## Simplification advisories (not bugs, intentionally skipped)
- Digest/agents-CLI/worker each format numbers slightly differently (`compact` vs
  `oneLine`); merging them was judged not worth losing the per-surface wording.
- The mobile custom-range popover could use the HTML Popover API instead of manual
  positioning; left as a plain positioned panel for now.
