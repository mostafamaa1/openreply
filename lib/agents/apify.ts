/**
 * Competitor posts from Apify's `apify/instagram-scraper`.
 *
 * Uses resultsType "posts", which walks the profile's feed, rather than the
 * profile scraper's `latestPosts` (only the 12 newest). Every run carries a
 * spend cap so a bad input can't burn the free plan's $5 monthly credit.
 */

import { getApifyToken } from "@/lib/agents/config";

const APIFY_API = "https://api.apify.com/v2";
const ACTOR_ID = "apify~instagram-scraper";
// Free plan price is $2.70 per 1,000 results; this caps a single run well
// below the monthly credit even if the limits are raised.
const MAX_CHARGE_USD_PER_RUN = 1;
const POLL_WAIT_SECONDS = 60;
const MAX_POLLS = 20;

export interface ScrapedPost {
  ownerUsername: string;
  shortCode: string;
  url: string;
  type: string;
  caption: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  postedAt: Date | null;
}

export interface ScrapedProfile {
  username: string;
  followersCount: number | null;
}

interface ApifyRun {
  id: string;
  status: string;
  defaultDatasetId: string;
}

function requireToken(): string {
  const token = getApifyToken();
  if (!token) throw new Error("APIFY_TOKEN is not set");
  return token;
}

async function apifyFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${APIFY_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${requireToken()}`,
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Apify ${response.status}: ${body.slice(0, 300)}`);
  }
  return (await response.json()) as T;
}

function isFinished(status: string): boolean {
  return !["READY", "RUNNING"].includes(status);
}

/** Start the actor, wait for it to finish, and return its dataset items. */
async function runScraper(
  input: Record<string, unknown>,
  maxItems: number
): Promise<Record<string, unknown>[]> {
  const params = new URLSearchParams({
    waitForFinish: String(POLL_WAIT_SECONDS),
    maxItems: String(maxItems),
    maxTotalChargeUsd: String(MAX_CHARGE_USD_PER_RUN),
  });
  let { data: run } = await apifyFetch<{ data: ApifyRun }>(
    `/acts/${ACTOR_ID}/runs?${params}`,
    { method: "POST", body: JSON.stringify(input) }
  );

  for (let i = 0; i < MAX_POLLS && !isFinished(run.status); i++) {
    ({ data: run } = await apifyFetch<{ data: ApifyRun }>(
      `/actor-runs/${run.id}?waitForFinish=${POLL_WAIT_SECONDS}`
    ));
  }
  if (!isFinished(run.status)) {
    // Giving up: stop the run so it does not keep billing for results nobody reads.
    await apifyFetch(`/actor-runs/${run.id}/abort`, { method: "POST" }).catch(() => undefined);
    throw new Error(`Apify run ${run.id} did not finish in time; aborted`);
  }
  if (run.status !== "SUCCEEDED") {
    throw new Error(`Apify run ${run.id} ended as ${run.status}`);
  }

  return apifyFetch<Record<string, unknown>[]>(
    `/datasets/${run.defaultDatasetId}/items?clean=true`
  );
}

function profileUrl(username: string): string {
  return `https://www.instagram.com/${username}/`;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

export async function scrapeCompetitorPosts(
  usernames: string[],
  postsPerAccount: number
): Promise<ScrapedPost[]> {
  if (usernames.length === 0) return [];
  const items = await runScraper(
    {
      directUrls: usernames.map(profileUrl),
      resultsType: "posts",
      resultsLimit: postsPerAccount,
      addParentData: false,
    },
    usernames.length * postsPerAccount
  );

  return items.flatMap((item) => {
    const shortCode = item.shortCode;
    const owner = item.ownerUsername;
    if (typeof shortCode !== "string" || typeof owner !== "string") return [];
    return [
      {
        ownerUsername: owner.toLowerCase(),
        shortCode,
        url:
          typeof item.url === "string"
            ? item.url
            : `https://www.instagram.com/p/${shortCode}/`,
        type: typeof item.type === "string" ? item.type : "Unknown",
        caption: typeof item.caption === "string" ? item.caption : null,
        // Plays match what Instagram shows as views on reels.
        views: num(item.videoPlayCount) ?? num(item.videoViewCount),
        likes: num(item.likesCount),
        comments: num(item.commentsCount),
        postedAt:
          typeof item.timestamp === "string" ? new Date(item.timestamp) : null,
      },
    ];
  });
}

/** Follower counts only. One result per profile, so it costs almost nothing. */
export async function scrapeCompetitorProfiles(
  usernames: string[]
): Promise<ScrapedProfile[]> {
  if (usernames.length === 0) return [];
  const items = await runScraper(
    {
      directUrls: usernames.map(profileUrl),
      resultsType: "details",
      resultsLimit: 1,
    },
    usernames.length
  );

  return items.flatMap((item) =>
    typeof item.username === "string"
      ? [
          {
            username: item.username.toLowerCase(),
            followersCount: num(item.followersCount),
          },
        ]
      : []
  );
}
