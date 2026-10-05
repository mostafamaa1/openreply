/**
 * Own-account stats for the content agents, from the official Instagram API.
 *
 * Same sources as the Overview page: every post via /me/media pagination, and
 * views/reach/saves/shares from per-media insights. Ranking uses real views,
 * so the all-time top post is right (unlike a scraper's "latest posts" list).
 */

import {
  getAllUserMedia,
  getMediaInsights,
  getUserInfo,
  type InstagramMedia,
} from "@/lib/meta/client";
import { mapWithConcurrency } from "@/lib/utils/concurrency";

const MAX_POSTS = 500;
const INSIGHTS_CONCURRENCY = 8;

export interface OwnPost {
  id: string;
  caption: string | null;
  permalink: string | null;
  mediaType: string;
  timestamp: string;
  views: number | null;
  reach: number | null;
  likes: number;
  comments: number;
  saved: number | null;
  shares: number | null;
}

export interface OwnStats {
  username: string;
  followers: number | null;
  /** Every post, ranked by views (then likes when views are unavailable). */
  posts: OwnPost[];
  totals: {
    posts: number;
    views: number;
    likes: number;
    comments: number;
    saved: number;
    shares: number;
  };
  /** Interactions per view across all posts, or null without view data. */
  engagementRate: number | null;
}

function isVideoLike(media: InstagramMedia): boolean {
  return media.media_product_type === "REELS" || media.media_type === "VIDEO";
}

export async function collectOwnStats(accessToken: string): Promise<OwnStats> {
  const [user, media] = await Promise.all([
    getUserInfo(accessToken),
    getAllUserMedia(accessToken, MAX_POSTS),
  ]);

  const insights = await mapWithConcurrency(
    media,
    INSIGHTS_CONCURRENCY,
    async (m) => {
      const metrics = isVideoLike(m)
        ? ["views", "reach", "saved", "shares"]
        : ["reach", "saved", "shares"];
      try {
        return await getMediaInsights(accessToken, m.id, metrics);
      } catch {
        return null;
      }
    }
  );

  const posts: OwnPost[] = media.map((m, i) => ({
    id: m.id,
    caption: m.caption?.trim() ?? null,
    permalink: m.permalink ?? null,
    mediaType: m.media_product_type ?? m.media_type,
    timestamp: m.timestamp,
    views: insights[i]?.views ?? null,
    reach: insights[i]?.reach ?? null,
    likes: m.like_count ?? 0,
    comments: m.comments_count ?? 0,
    saved: insights[i]?.saved ?? null,
    shares: insights[i]?.shares ?? null,
  }));

  posts.sort((a, b) => (b.views ?? -1) - (a.views ?? -1) || b.likes - a.likes);

  const totals = posts.reduce(
    (acc, p) => {
      acc.posts += 1;
      acc.views += p.views ?? 0;
      acc.likes += p.likes;
      acc.comments += p.comments;
      acc.saved += p.saved ?? 0;
      acc.shares += p.shares ?? 0;
      return acc;
    },
    { posts: 0, views: 0, likes: 0, comments: 0, saved: 0, shares: 0 }
  );

  const interactions =
    totals.likes + totals.comments + totals.saved + totals.shares;

  return {
    username: user.username,
    followers: user.followers_count ?? null,
    posts,
    totals,
    engagementRate: totals.views > 0 ? interactions / totals.views : null,
  };
}
