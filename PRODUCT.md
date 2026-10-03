# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: a solo Instagram creator running their own content business (the
maintainer runs it for a public speaking and communication coaching account).
They open the dashboard on a laptop to plan the week and on a phone between
shoots to check how a reel and its comment-to-DM campaign are doing.

Secondary: developers and small agencies who self-host the open-source app for
one or a few creator accounts.

## Product Purpose

OpenReply turns Instagram comments, DMs and story replies into automatic private
replies (comment-to-DM campaigns), and is growing into the creator's one place
to manage content and analytics: post performance, follower growth, campaign
results, an inbox, and five weekly content agents (Ideator, Hook & Script,
Planner, Analyst, DM Manager) that report to Telegram.

Success: the creator knows within seconds what is working, what to post next,
and whether every campaign is converting, without opening Instagram's own
insights.

## Positioning

Free, open-source and self-hosted: the creator's own data in their own
database, official Instagram API for their stats, and no per-contact pricing
(the ManyChat alternative). Content agents run on free tiers (Gemini, Apify,
Telegram).

## Operating Context

- Weekly ritual: agents run Saturday 20:00 Asia/Riyadh; digest lands on
  Telegram; the creator reviews ideas, scripts and the 7-day calendar.
- Daily: check DMs sent, link clicks, failures, and the latest reel's numbers.
- Campaigns are built per reel with keywords, DM copy, link buttons and
  follow gates.

## Capabilities and Constraints

- Next.js 16 App Router web app on Vercel; worker on an Oracle VM; Postgres on
  Supabase free; Redis Cloud free. Charts use Recharts.
- Instagram Login API only: own-account insights (views, reach, saves, shares),
  ~30 days of account insights (older follower history only from snapshots).
- Competitor data comes from Apify (public posts only, capped spend).
- Meta allows one private reply per comment; DMs deduplicated per person per
  campaign.
- User text may be Arabic or accented Latin; the creator's own content is
  English.
- Any polling of the database must stay cheap (free tiers).

## Brand Commitments

- Name: OpenReply. Public repo; no secrets or personal data in committed files.

## Evidence on Hand

Real data in the instance: 420+ posts with insights, follower snapshots since
August 2026, 19 campaigns with DM logs and link clicks, five competitors'
public posts, agent outputs. No testimonials, customer logos or benchmarks
exist; none may be invented.

## Product Principles

- The creator's real numbers lead; every chart answers "is this working?".
- One glance on a phone, depth on a laptop.
- Free to run: no feature may require a paid tier.
- Automation is visible: what ran, when, what it produced, what failed.

## Accessibility & Inclusion

Readable in light and dark; charts must not rely on colour alone; respects
reduced motion.
