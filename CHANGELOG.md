# Changelog

All notable changes to this project are documented here.

## 0.2.0 — 2026-10-03

### Added
- Five content agents (Ideator, Hook & Script, Planner, Analyst, DM Manager) that pull your own Instagram post history and up to 10 competitors' posts (via Apify), run on Gemini with a model fallback chain, and send a weekly Telegram digest. Runs Saturday 20:00 in `AGENTS_TIMEZONE` by default, or on demand from the new Agents page (rate-limited to one manual run per workspace per 6 hours).
- 11 content categories (your 7 plus Storytelling & Confidence and Voice & Body Language), weighted idea allocation by past results, and automatic tagging of every post's category.
- Redesigned dashboard ("Matchday Broadcast"): light/dark theme toggle, a global date-range picker with custom ranges, trend charts, a posting-time heatmap, a campaign funnel, and mobile support.
- Follower analytics per day/week/30-day window, backfilled automatically on first view.
- Email + password sign-in (`npm run set-password`), alongside the existing magic-link fallback.
- The site now opens on `/login`; the marketing landing page was removed.

### Changed
- Sessions switched from database-backed to JWT. **Everyone is signed out once** after this deploys; sign back in.
- `DmLog` gained a `(workspaceId, createdAt)` index, built `CONCURRENTLY` so it does not block the worker's writes during deploy.

### Fixed
- An open redirect in the post-login `callbackUrl` (including a dot-segment bypass like `/..//evil.com`) and an unbounded custom analytics range (a 126-year range previously took ~20s and returned several MB).
- Login and password-change attempts are now throttled (10 per 15 minutes) with a fail-open guard if Redis itself is unreachable.

### Known gaps (see TODOS.md)
- Session revocation on password change, a logs "All time" filter, `PostCategory` cleanup on account disconnect, and a few lower-severity items from the pre-landing review.
